import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lottie/lottie.dart';

import '../admin/admin_screen.dart';
import '../api/client.dart';
import '../api/models.dart';
import '../auth/change_password_screen.dart';
import '../auth/session_store.dart';
import '../push/push_service.dart';
import '../settings/settings_store.dart';
import '../theme/app_icons.dart';
import '../theme/tokens.dart';
import '../desktop/desktop.dart';
import '../desktop/desktop_alarm.dart';
import '../wear/wear_service.dart';
import 'alarm_service.dart';
import 'call_card.dart';
import 'history_screen.dart';
import 'calls_feed.dart';
import 'shift_stats.dart';

/// The nurse's screen, transcribed from the approved design.
///
/// Laid out inside a 430px-wide column as the design is, so the proportions
/// hold on a tablet at the nurses' station as well as on a phone.
class CallsScreen extends StatefulWidget {
  const CallsScreen({
    super.key,
    required this.feed,
    required this.sessions,
    required this.settings,
    required this.push,
    required this.api,
    required this.wear,
  });

  final CallsFeed feed;
  final SessionStore sessions;
  final SettingsStore settings;
  final PushService push;

  /// Passed down for the screens the profile opens -- history and the password
  /// form -- rather than each of them reaching for a global.
  final ApiClient api;

  final WearService wear;

  @override
  State<CallsScreen> createState() => _CallsScreenState();
}

class _CallsScreenState extends State<CallsScreen> with WidgetsBindingObserver {
  int? _floorFilter;
  int? _busyCallId;
  int _tab = 0;

  /// Calls the nurse has silenced with the banner button. A call arriving
  /// after that is not in here, so it rings again.
  final Set<int> _silenced = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.feed.addListener(_onFeed);
    if (!widget.feed.isRunning) {
      widget.feed.start(token: widget.sessions.session?.accessToken);
    }
    _syncAlarm();
  }

  @override
  void dispose() {
    AlarmService.instance.stopAlarm();
    WidgetsBinding.instance.removeObserver(this);
    widget.feed.removeListener(_onFeed);
    widget.feed.stop();
    super.dispose();
  }

  /// True between leaving the app and coming back to it.
  bool _backgrounded = false;

  void _syncAlarm() {
    final calls = widget.feed.calls;
    _silenced.retainWhere((id) => calls.any((c) => c.callId == id));
    final ids = ringingIds(calls, _silenced, DateTime.now());
    AlarmService.instance.sync(ids, calls: calls);
    // In the background the feed runs only to learn when to stop ringing: once
    // nothing rings, it stops too, and the push path takes over again.
    if (_backgrounded && ids.isEmpty && widget.feed.isRunning) {
      widget.feed.stop();
    }
  }

  void _silence() {
    HapticFeedback.mediumImpact();
    _silenced.addAll(
      widget.feed.calls.where((c) => c.status == 'active').map((c) => c.callId),
    );
    AlarmService.instance.stopAlarm();
    setState(() {});
  }

  void _onFeed() {
    if (mounted) {
      _syncAlarm();
      setState(() {});
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Polling and the live socket both stop when the screen does. A phone in a
    // pocket should be woken by a push, not by a request every few seconds all
    // shift -- and an open socket on a sleeping phone is a battery cost that
    // buys nothing, because the push path is what wakes a backgrounded app.
    if (state == AppLifecycleState.resumed) {
      _backgrounded = false;
      widget.feed.start(token: widget.sessions.session?.accessToken);
      // Renew while we are here. Ninety-day tokens expire quietly otherwise, and
      // the first a nurse would know of it is the login screen mid-shift.
      widget.sessions.renew();
      _syncAlarm();
    } else if (state == AppLifecycleState.paused && !isDesktop) {
      // Not on the desk build: there is no push to take over, so a minimised
      // window has to keep listening or the ward PC goes deaf.
      _backgrounded = true;
      // Leaving the app used to silence a waiting call. Now the alarm keeps
      // ringing (it is a foreground service), and the feed keeps running while
      // it does, so another nurse answering the call still stops it here.
      if (!AlarmService.instance.isPlaying) widget.feed.stop();
    }
  }

  List<Call> get _visible {
    final all = widget.feed.calls;
    if (_floorFilter == null) return all;
    return all.where((c) => c.floor == _floorFilter).toList(growable: false);
  }

  Future<void> _ack(Call call) async {
    setState(() => _busyCallId = call.callId);
    try {
      await widget.feed.acknowledge(call.callId);
      _syncAlarm();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Qabul qilinmadi — qayta urinib ko‘ring'),
            backgroundColor: T.red600,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busyCallId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    final feed = widget.feed;
    final session = widget.sessions.session;

    return Scaffold(
      backgroundColor: p.page,
      body: SafeArea(
        bottom: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: _tab == 0
                ? _callsTab(feed, session)
                : _ProfileTab(
                    session: session,
                    stats: feed.stats,
                    clinicName: feed.clinicName,
                    settings: widget.settings,
                    push: widget.push,
                    api: widget.api,
                    wear: widget.wear,
                    onSignOut: () async {
                      await AlarmService.instance.stopAlarm();
                      await widget.sessions.signOut();
                    },
                  ),
          ),
        ),
      ),
      bottomNavigationBar: _BottomNav(
        index: _tab,
        badge: feed.calls.length,
        onSelect: (i) => setState(() => _tab = i),
      ),
    );
  }

  Widget _callsTab(CallsFeed feed, Session? session) {
    final p = Palette.of(context);
    final floors = {for (final c in feed.calls) c.floor}.toList()..sort();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Sticky, with its own ground and a hairline under it, as the design
        // has it: the nurse's name, the floor filter and the subscription state
        // stay put while the calls scroll past them.
        Container(
          decoration: BoxDecoration(
            color: p.navBar,
            border: Border(bottom: BorderSide(color: p.border)),
          ),
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _Header(name: session?.name ?? '', clinic: feed.clinicName),
              if (session?.isGuest == true || feed.isDemo) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: p.accent.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: p.accent.withValues(alpha: 0.35)),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.play_circle_outline_rounded, size: 18, color: p.accent),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Demo Rejim: Bemor chaqiruvlari simulyatsiyasi',
                          style: TextStyle(fontSize: 12, color: p.accent, fontWeight: FontWeight.w600),
                        ),
                      ),
                      TextButton.icon(
                        onPressed: () {
                          HapticFeedback.mediumImpact();
                          feed.addSimulatedCall();
                        },
                        style: TextButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        icon: const Icon(Icons.add_alert_rounded, size: 14),
                        label: const Text(
                          '+ Chaqiruv',
                          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              if (shouldRing(feed.calls, _silenced, DateTime.now())) ...[
                const SizedBox(height: 10),
                _SilenceBar(onSilence: _silence),
              ],
              if (!feed.reachable && !feed.isDemo) ...[
                const SizedBox(height: 12),
                _Banner(
                  icon: Icons.cloud_off,
                  tint: p.dangerInk,
                  bg: p.bannerBg(p.dangerInk),
                  ink: p.text1,
                  text:
                      'Serverga ulanib bo‘lmadi — ro‘yxat eskirgan bo‘lishi mumkin',
                ),
              ],
              if (feed.notice case final n? when n.warn || n.blocked) ...[
                const SizedBox(height: 12),
                _Banner(
                  icon: Icons.timelapse,
                  tint: p.warnInk,
                  bg: p.bannerBg(p.warnInk),
                  ink: p.text1,
                  badge: n.blocked ? 'TO‘XTATILGAN' : 'OGOHLANTIRISH',
                  text: n.blocked
                      ? 'Obuna to‘lanmagan. Chaqiruvlar ishlashda davom etadi.'
                      : n.daysLeft != null
                      ? 'Obuna: ${n.daysLeft} kun qoldi'
                      : 'Obuna muddati tugayapti',
                ),
              ],
              if (floors.length > 1) ...[
                const SizedBox(height: 12),
                _FloorFilter(
                  floors: floors,
                  selected: _floorFilter,
                  counts: {
                    for (final f in floors)
                      f: feed.calls.where((c) => c.floor == f).length,
                  },
                  total: feed.calls.length,
                  onSelect: (f) => setState(() => _floorFilter = f),
                ),
              ],
            ],
          ),
        ),
        Expanded(
          child: feed.loading
              ? const Center(child: CircularProgressIndicator())
              : _visible.isEmpty
              ? const _Empty()
              : RefreshIndicator(
                  onRefresh: feed.refresh,
                  backgroundColor: p.card,
                  color: T.sky400,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: [
                      for (final c in _visible)
                        CallCard(
                          call: c,
                          now: feed.now,
                          busy: _busyCallId == c.callId,
                          onAcknowledge: () => _ack(c),
                        ),
                      // Flows after the cards rather than being pinned to
                      // the bottom, as the design has it. Pinned, the strip
                      // competes with the call list for the eye; here it is
                      // what you reach after the calls, which is when it
                      // means anything.
                      const SizedBox(height: 2),
                      _StatsStrip(stats: feed.stats),
                    ],
                  ),
                ),
        ),
      ],
    );
  }
}

// --------------------------------------------------------------------- header

class _Header extends StatelessWidget {
  const _Header({required this.name, this.clinic});

  final String name;
  final String? clinic;

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return Row(
      children: [
        const AppLogo(size: 36, withGlow: true),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                clinic?.isNotEmpty == true ? clinic! : 'NurseCall',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: p.text1,
                  letterSpacing: -0.2,
                ),
              ),
              Row(
                children: [
                  // The live dot, as the design has it. It says the phone is
                  // in duty mode, which is the one thing a nurse glancing at
                  // the top of the screen needs to be sure of.
                  _Dot(),
                  const SizedBox(width: 5),
                  Text(
                    'Navbatchilik rejimi',
                    style: TextStyle(fontSize: 11, color: p.text3),
                  ),
                ],
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.fromLTRB(4, 4, 12, 4),
          decoration: BoxDecoration(
            color: p.card,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: p.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 26,
                height: 26,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: p.accent.withValues(alpha: 0.16),
                  shape: BoxShape.circle,
                  border: Border.all(color: p.accent.withValues(alpha: 0.40), width: 1.5),
                ),
                child: Icon(Icons.person_rounded, size: 16, color: p.accent),
              ),
              const SizedBox(width: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 108),
                child: Text(
                  name.isEmpty ? 'Hamshira' : name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: p.text1,
                    letterSpacing: -0.2,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// -------------------------------------------------------------------- banners

class _Dot extends StatelessWidget {
  const _Dot();

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return Container(
      width: 6,
      height: 6,
      decoration: BoxDecoration(color: p.accentOk, shape: BoxShape.circle),
    );
  }
}

/// Stops the alarm without acknowledging anything. The calls stay on the
/// board; only a new call makes the phone ring again.
class _SilenceBar extends StatelessWidget {
  const _SilenceBar({required this.onSilence});

  final VoidCallback onSilence;

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 6, 6, 6),
      decoration: BoxDecoration(
        color: p.bannerBg(p.dangerInk).withValues(alpha: 0.30),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: p.dangerInk.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Icon(Icons.notifications_active, size: 18, color: p.dangerInk),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Signal chalinmoqda',
              style: TextStyle(fontSize: 12.5, color: p.text2),
            ),
          ),
          TextButton.icon(
            key: const Key('silence-alarm'),
            onPressed: onSilence,
            icon: const Icon(Icons.volume_off_rounded, size: 16),
            label: const Text(
              'Ovozni o‘chirish',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({
    required this.icon,
    required this.tint,
    required this.bg,
    required this.ink,
    required this.text,
    this.badge,
  });

  final IconData icon;
  final Color tint;
  final Color bg;
  final Color ink;
  final String text;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: bg.withValues(alpha: 0.30),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: tint.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: tint),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: TextStyle(fontSize: 12.5, color: p.text2)),
          ),
          if (badge case final b?) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                border: Border.all(color: tint.withValues(alpha: 0.55)),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                b,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.4,
                  color: tint,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// --------------------------------------------------------------------- filter

class _FloorFilter extends StatelessWidget {
  const _FloorFilter({
    required this.floors,
    required this.selected,
    required this.counts,
    required this.total,
    required this.onSelect,
  });

  final List<int> floors;
  final int? selected;
  final Map<int, int> counts;
  final int total;
  final ValueChanged<int?> onSelect;

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return SizedBox(
      height: 30,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          _pill(p, 'Barchasi', total, selected == null, () => onSelect(null)),
          for (final f in floors)
            _pill(
              p,
              '$f-qavat',
              counts[f] ?? 0,
              selected == f,
              () => onSelect(f),
            ),
        ],
      ),
    );
  }

  Widget _pill(Palette p, String label, int count, bool on, VoidCallback tap) =>
      Padding(
        padding: const EdgeInsets.only(right: 8),
        child: GestureDetector(
          onTap: tap,
          child: Container(
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: on ? T.sky500 : p.card,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: on ? T.sky500 : p.border),
              boxShadow: on
                  ? [
                      BoxShadow(
                        color: T.sky400.withValues(alpha: 0.35),
                        blurRadius: 14,
                      ),
                    ]
                  : null,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: on ? T.slate950 : p.text3,
                  ),
                ),
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 1,
                  ),
                  decoration: BoxDecoration(
                    color: on ? T.slate950.withValues(alpha: 0.20) : p.border,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '$count',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: on ? T.slate950 : p.text3,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
}

// ---------------------------------------------------------------------- stats

class _StatsStrip extends StatelessWidget {
  const _StatsStrip({required this.stats});

  final ShiftStats stats;

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return Row(
      children: [
        Expanded(
          child: _StatCard(
            icon: Icons.speed,
            iconTint: p.accent,
            label: 'O‘rtacha javob',
            value: answerLabel(stats.typicalAnswer),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _StatCard(
            icon: Icons.task_alt,
            iconTint: p.accentOk,
            label: 'Bugun qabul qilindi',
            value: '${stats.answeredToday}',
          ),
        ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.icon,
    required this.iconTint,
    required this.label,
    required this.value,
  });

  final IconData icon;

  /// Only the glyph is tinted. Both figures stay white, as the design has them:
  /// a green number reads as a verdict on the shift, and these are counts.
  final Color iconTint;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: p.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: p.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: p.text3,
                  ),
                ),
              ),
              Icon(icon, size: 18, color: iconTint),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              fontFamily: T.mono,
              fontSize: 22,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.5,
              height: 1.1,
              color: p.text1,
            ),
          ),
        ],
      ),
    );
  }
}

// ----------------------------------------------------------------------- misc

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return Center(
      child: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Lottie.asset(
              'assets/animations/health_online_report.json',
              width: 190,
              height: 190,
              fit: BoxFit.contain,
              errorBuilder: (context, error, stackTrace) => Icon(
                Icons.check_circle_outline,
                size: 56,
                color: T.emerald400,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Faol chaqiruv yo‘q',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: p.text1,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Yangi chaqiruv kelsa shu yerda chiqadi',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13.5,
                color: p.text3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomNav extends StatelessWidget {
  const _BottomNav({
    required this.index,
    required this.badge,
    required this.onSelect,
  });

  final int index;
  final int badge;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return Container(
      decoration: BoxDecoration(
        color: p.navBar,
        border: Border(top: BorderSide(color: p.border)),
      ),
      child: SafeArea(
        top: false,
        minimum: const EdgeInsets.only(bottom: 6),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _item(
                p,
                0,
                icon: const Icon(Icons.notifications_active_rounded, size: 26),
                label: 'Chaqiruvlar',
                count: badge,
              ),
              _item(
                p,
                1,
                icon: const Icon(Icons.person_rounded, size: 26),
                label: 'Profil',
                count: 0,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _item(
    Palette p,
    int i, {
    required Widget icon,
    required String label,
    required int count,
  }) {
    final on = index == i;
    final tint = on ? T.sky400 : T.slate500;
    return GestureDetector(
      onTap: () => onSelect(i),
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              IconTheme(
                data: IconThemeData(color: tint, size: 26),
                child: icon,
              ),
              if (count > 0)
                Positioned(
                  right: -6,
                  top: -4,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 5,
                      vertical: 1,
                    ),
                    decoration: BoxDecoration(
                      color: T.red600,
                      borderRadius: BorderRadius.circular(999),
                      // Ringed in the bar's own colour so the badge reads as a
                      // separate object rather than smudging into the icon.
                      border: Border.all(color: p.navBar, width: 2),
                    ),
                    child: Text(
                      '$count',
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: on ? FontWeight.w700 : FontWeight.w500,
              letterSpacing: -0.2,
              // The active label is white while its icon is blue: two channels
              // for the same fact, which is what keeps the tab readable on a
              // screen being glanced at from an angle.
              color: on ? p.text1 : p.text3,
            ),
          ),
          const SizedBox(height: 3),
          // A dot under the active tab, as the design has it: the colour change
          // alone is a single channel, and this one survives a screen someone is
          // looking at from an angle.
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: on ? T.sky400 : Colors.transparent,
              shape: BoxShape.circle,
            ),
          ),
        ],
      ),
    );
  }
}

// -------------------------------------------------------------------- profile

class _ProfileTab extends StatefulWidget {
  const _ProfileTab({
    required this.session,
    required this.stats,
    this.clinicName,
    required this.settings,
    required this.push,
    required this.api,
    required this.wear,
    required this.onSignOut,
  });

  final Session? session;
  final ShiftStats stats;
  final String? clinicName;
  final SettingsStore settings;
  final PushService push;
  final ApiClient api;
  final WearService wear;
  final Future<void> Function() onSignOut;

  @override
  State<_ProfileTab> createState() => _ProfileTabState();
}

class _ProfileTabState extends State<_ProfileTab> with WidgetsBindingObserver {
  NotificationState _notif = NotificationState.unknown;
  WatchState _watch = WatchState.none;
  bool _sendingToWatch = false;
  String? _clinicName;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _clinicName = widget.clinicName;
    _refresh();
  }

  @override
  void didUpdateWidget(covariant _ProfileTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.clinicName != null && widget.clinicName != _clinicName) {
      _clinicName = widget.clinicName;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Re-read on return: the nurse has very likely just come back from the
    // system settings screen this page sent her to, and showing the old answer
    // would make the fix look like it did not work.
    if (state == AppLifecycleState.resumed) _refresh();
  }

  Future<void> _refresh() async {
    final s = await widget.push.notificationState();
    if (mounted) setState(() => _notif = s);
    // Asked here rather than on a timer: it is a Bluetooth round trip, and the
    // only moment the answer matters is when somebody is looking at this screen.
    final w = await widget.wear.refresh();
    if (mounted) setState(() => _watch = w);

    if (_clinicName == null || _clinicName!.isEmpty) {
      try {
        final c = await widget.api.clinic();
        if (mounted && c.name.isNotEmpty) {
          setState(() => _clinicName = c.name);
        }
      } catch (_) {}
    }
  }

  /// Re-sends the session to the watch, for when it was out of range at sign-in.
  Future<void> _sendToWatch() async {
    final token = widget.session?.accessToken;
    if (token == null || _sendingToWatch) return;
    setState(() => _sendingToWatch = true);
    final ok = await widget.wear.sendToken(token);
    if (!mounted) return;
    setState(() {
      _sendingToWatch = false;
      _watch = widget.wear.state;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          ok
              ? 'Soatga yuborildi — endi soatda ham shu hisob ishlaydi'
              : 'Soat topilmadi. Bluetooth yoqilganini va soat yaqinda '
                    'ekanini tekshiring.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    final session = widget.session;
    final clinicDisplay = widget.clinicName ?? _clinicName;
    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        // Top profile hero container - merged seamlessly with the top, with rounded bottom
        Container(
          decoration: BoxDecoration(
            color: p.navBar,
            borderRadius: const BorderRadius.vertical(
              bottom: Radius.circular(30),
            ),
            border: Border(
              bottom: BorderSide(color: p.border, width: 1.5),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.16),
                blurRadius: 22,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 22),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                    // Gender-neutral medical badge (Clean silhouette & clinical cross)
                    Container(
                      width: 76,
                      height: 76,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            p.accent.withValues(alpha: 0.22),
                            p.accent.withValues(alpha: 0.08),
                          ],
                        ),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: p.accent.withValues(alpha: 0.45),
                          width: 1.8,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF00E5FF).withValues(alpha: 0.16),
                            blurRadius: 16,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          Icon(
                            Icons.person_rounded,
                            size: 46,
                            color: p.accent,
                          ),
                          Positioned(
                            right: 6,
                            bottom: 6,
                            child: Container(
                              padding: const EdgeInsets.all(3),
                              decoration: BoxDecoration(
                                color: p.card,
                                shape: BoxShape.circle,
                                border: Border.all(color: p.accent, width: 1.5),
                              ),
                              child: Icon(
                                Icons.medical_services_rounded,
                                size: 12,
                                color: p.accent,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 16),

                    // Staff metadata
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            session?.name.isNotEmpty == true
                                ? session!.name
                                : 'Hamshira',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.w800,
                              color: p.text1,
                              letterSpacing: -0.3,
                              height: 1.2,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 9,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: p.accent.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                color: p.accent.withValues(alpha: 0.30),
                              ),
                            ),
                            child: Text(
                              switch (session?.role) {
                                'nurse' => 'Hamshira (Navbatchi)',
                                'admin' => 'Klinika administratori',
                                _ => 'Tibbiy xodim',
                              },
                              style: TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w700,
                                color: p.accent,
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Icon(
                                Icons.local_hospital_outlined,
                                size: 14,
                                color: p.text3,
                              ),
                              const SizedBox(width: 6),
                              Expanded(
                                child: Text(
                                  clinicDisplay?.isNotEmpty == true
                                      ? clinicDisplay!
                                      : (session?.clinicId != null
                                          ? 'Klinika #${session!.clinicId}'
                                          : 'NurseCall Tizimi'),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: p.text2,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Icon(
                                Icons.badge_outlined,
                                size: 14,
                                color: p.text3,
                              ),
                              const SizedBox(width: 6),
                              Text(
                                'Xodim ID: #${(session?.name.hashCode ?? 1024).abs() % 9000 + 1000}',
                                style: TextStyle(
                                  fontSize: 11.5,
                                  fontFamily: T.mono,
                                  color: p.text3,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
          child: _StatsStrip(stats: widget.stats),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
        if (isDesktop)
          _Section(
            title: 'Signal',
            children: [
              _Row(
                icon: Icons.computer,
                tint: p.accentOk,
                label: 'Bu kompyuter chaqiruvda signal beradi',
                sub: 'Oyna kichraytirilgan bo‘lsa ham — faqat dasturni yopmang',
              ),
              _Row(
                icon: Icons.volume_up,
                label: 'Signal ovozini sinash',
                sub: 'Eshitilmasa, kompyuter ovozi va karnayni tekshiring',
                onTap: () => desktopAlarm?.test(),
              ),
            ],
          )
        else
        _Section(
          title: 'Bildirishnomalar',
          children: [
            _SwitchRow(
              icon: Icons.notifications_active,
              label: 'Bu telefonga chaqiruv kelsin',
              sub: widget.settings.pushEnabled
                  ? 'Chaqiruv kelganda bu telefon ogohlantiradi'
                  : 'O‘chirilgan — bu telefonga chaqiruv kelmaydi',
              value: widget.settings.pushEnabled,
              onChanged: (v) async {
                await widget.settings.setPushEnabled(v);
                if (v) {
                  await widget.push.register();
                } else {
                  await widget.push.unregister();
                }
                if (mounted) setState(() {});
              },
            ),
            // Only meaningful while this handset is meant to ring. With the
            // switch off, "the system settings are fine" would be a true
            // sentence that reads as a false reassurance -- nothing is coming
            // through either way, and the reason is the switch above.
            if (widget.settings.pushEnabled) ...[
              if (_notif.problem case final problem?)
                _Warning(text: problem, onFix: widget.push.openSystemSettings)
              else
                _Row(
                  icon: Icons.verified,
                  tint: p.accentOk,
                  label: 'Tizim sozlamalari joyida',
                  sub: 'Chaqiruv jim rejimda ham eshitiladi',
                ),
              _Row(
                icon: Icons.tune,
                label: 'Chaqiruv ovozi',
                sub: 'Android sozlamalarida tanlang — signal ham shu ovozda chaladi',
                onTap: widget.push.openSystemSettings,
              ),
            ],
          ],
        ),
        const SizedBox(height: 16),
        _Section(
          title: 'Smena',
          children: [
            _Row(
              icon: Icons.history,
              label: 'Chaqiruvlar tarixi',
              sub: 'Kim javob bergan, qancha kutilgan',
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => HistoryScreen(api: widget.api),
                ),
              ),
            ),
          ],
        ),
        // Admin-only. A nurse never sees this section; the routes behind it are
        // admin-only on the server too, so hiding it is a courtesy rather than
        // the enforcement.
        if (session?.isAdmin == true) ...[
          const SizedBox(height: 16),
          _Section(
            title: 'Klinika',
            children: [
              _Row(
                icon: Icons.admin_panel_settings,
                label: 'Klinika sozlamalari',
                sub: 'Qabul qilgichlar, tugmalar, xonalar, hamshiralar',
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => AdminScreen(api: widget.api),
                  ),
                ),
              ),
            ],
          ),
        ],
        // A PC at the nurses' station has no watch to pair with.
        if (!isDesktop) ...[
        const SizedBox(height: 16),
        _Section(
          title: 'Palata soati',
          children: [
            if (!_watch.connected)
              _Row(
                icon: Icons.watch_off,
                label: 'Soat ulanmagan',
                sub:
                    'Bluetooth yoqilgan va soat yaqinda bo‘lsa shu yerda chiqadi',
              )
            else ...[
              _Row(
                icon: Icons.watch,
                tint: p.accentOk,
                label: _watch.names.join(', '),
                // Says what was actually done, not what is assumed. A watch can
                // be connected over Bluetooth and still be signed in as the
                // nurse who went home.
                sub: _watch.tokenSent
                    ? 'Hisobingiz soatga yuborilgan'
                    : 'Hisob hali yuborilmagan',
              ),
              _Row(
                icon: _sendingToWatch ? Icons.sync : Icons.ios_share,
                label: 'Hisobni soatga yuborish',
                sub: 'Soatda email va parol terish shart emas',
                onTap: _sendingToWatch ? null : _sendToWatch,
              ),
            ],
          ],
        ),
        ],
        const SizedBox(height: 16),
        _Section(
          title: 'Hisob',
          children: [
            _Row(
              icon: Icons.password,
              label: 'Parolni o‘zgartirish',
              sub: 'Hisobingizni admin ochgan — parolni o‘zingizniki qiling',
              onTap: () async {
                final changed = await Navigator.of(context).push<bool>(
                  MaterialPageRoute(
                    builder: (_) => ChangePasswordScreen(api: widget.api),
                  ),
                );
                // context.mounted, not State.mounted: the snack bar is shown
                // through this context after an await, and it is the context
                // that has to still be in the tree.
                if (changed == true && context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Parol o‘zgartirildi. Qayta kiring.'),
                    ),
                  );
                  widget.onSignOut();
                }
              },
            ),
          ],
        ),
        const SizedBox(height: 16),
        _Section(
          title: 'Mavzu',
          children: [
            _ThemePicker(
              mode: widget.settings.themeMode,
              onSelect: (m) async {
                await widget.settings.setThemeMode(m);
                if (mounted) setState(() {});
              },
            ),
          ],
        ),
        const SizedBox(height: 22),
        SizedBox(
          height: 52,
          child: OutlinedButton.icon(
            onPressed: widget.onSignOut,
            icon: const Icon(Icons.logout, size: 19),
            label: const Text(
              'Chiqish',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
            ),
            style: OutlinedButton.styleFrom(
              foregroundColor: p.dangerInk,
              side: BorderSide(color: p.dangerInk.withValues(alpha: 0.5)),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          'Chiqsangiz bu telefon chaqiruv bildirishnomalarini olmay qoladi.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 11.5, color: p.text3),
        ),
            ],
          ),
        ),
      ],
    );
  }
}

// ------------------------------------------------------------------ settings

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Text(
            title.toUpperCase(),
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.6,
              color: p.text3,
            ),
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: p.card,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: p.border),
          ),
          child: Column(children: children),
        ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.label,
    this.sub,
    this.tint,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final String? sub;
  final Color? tint;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
        child: Row(
          children: [
            Icon(icon, size: 20, color: tint ?? p.text3),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: p.text1,
                    ),
                  ),
                  if (sub case final s?)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        s,
                        style: TextStyle(fontSize: 11.5, color: p.text3),
                      ),
                    ),
                ],
              ),
            ),
            if (onTap != null)
              Icon(Icons.chevron_right, size: 20, color: p.text3),
          ],
        ),
      ),
    );
  }
}

class _SwitchRow extends StatelessWidget {
  const _SwitchRow({
    required this.icon,
    required this.label,
    required this.sub,
    required this.value,
    required this.onChanged,
  });

  final IconData icon;
  final String label;
  final String sub;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
      child: Row(
        children: [
          Icon(icon, size: 20, color: value ? p.accent : p.text3),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: p.text1,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    sub,
                    style: TextStyle(fontSize: 11.5, color: p.text3),
                  ),
                ),
              ],
            ),
          ),
          Switch(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}

/// Shown when the system will swallow a call alert.
///
/// Phrased as what will happen to a patient rather than as a settings state,
/// and always with the way out attached: a warning a nurse cannot act on from
/// where she is standing is just noise.
class _Warning extends StatelessWidget {
  const _Warning({required this.text, required this.onFix});

  final String text;
  final VoidCallback onFix;

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return Container(
      margin: const EdgeInsets.fromLTRB(10, 0, 10, 10),
      padding: const EdgeInsets.fromLTRB(12, 10, 10, 10),
      decoration: BoxDecoration(
        color: p.bannerBg(p.dangerInk),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: p.dangerInk.withValues(alpha: 0.45)),
      ),
      child: Row(
        children: [
          Icon(Icons.volume_off, size: 19, color: p.dangerInk),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: TextStyle(fontSize: 12.5, color: p.text1)),
          ),
          const SizedBox(width: 8),
          TextButton(
            onPressed: onFix,
            style: TextButton.styleFrom(
              foregroundColor: p.dangerInk,
              padding: const EdgeInsets.symmetric(horizontal: 10),
              minimumSize: const Size(0, 34),
            ),
            child: const Text(
              'Tuzatish',
              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

class _ThemePicker extends StatelessWidget {
  const _ThemePicker({required this.mode, required this.onSelect});

  final ThemeMode mode;
  final ValueChanged<ThemeMode> onSelect;

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return Padding(
      padding: const EdgeInsets.all(10),
      child: Row(
        children: [
          _option(p, ThemeMode.system, Icons.brightness_auto, 'Avtomatik'),
          const SizedBox(width: 8),
          _option(p, ThemeMode.light, Icons.light_mode, 'Kunduzgi'),
          const SizedBox(width: 8),
          _option(p, ThemeMode.dark, Icons.dark_mode, 'Tungi'),
        ],
      ),
    );
  }

  Widget _option(Palette p, ThemeMode m, IconData icon, String label) {
    final on = mode == m;
    return Expanded(
      child: GestureDetector(
        onTap: () => onSelect(m),
        behavior: HitTestBehavior.opaque,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: on ? p.accent.withValues(alpha: 0.14) : p.chipBg,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: on ? p.accent : p.border),
          ),
          child: Column(
            children: [
              Icon(icon, size: 20, color: on ? p.accent : p.text3),
              const SizedBox(height: 5),
              Text(
                label,
                style: TextStyle(
                  fontSize: 11.5,
                  fontWeight: on ? FontWeight.w700 : FontWeight.w500,
                  color: on ? p.text1 : p.text3,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
