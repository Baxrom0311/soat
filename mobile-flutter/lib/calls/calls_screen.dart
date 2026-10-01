import 'package:flutter/material.dart';

import '../api/models.dart';
import '../auth/session_store.dart';
import '../theme/tokens.dart';
import 'call_card.dart';
import 'calls_feed.dart';
import 'shift_stats.dart';

/// The nurse's screen, transcribed from the approved design.
///
/// Laid out inside a 430px-wide column as the design is, so the proportions
/// hold on a tablet at the nurses' station as well as on a phone.
class CallsScreen extends StatefulWidget {
  const CallsScreen({super.key, required this.feed, required this.sessions});

  final CallsFeed feed;
  final SessionStore sessions;

  @override
  State<CallsScreen> createState() => _CallsScreenState();
}

class _CallsScreenState extends State<CallsScreen> with WidgetsBindingObserver {
  int? _floorFilter;
  int? _busyCallId;
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.feed.addListener(_onFeed);
    widget.feed.start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.feed.removeListener(_onFeed);
    widget.feed.stop();
    super.dispose();
  }

  void _onFeed() {
    if (mounted) setState(() {});
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Polling stops when the screen does. A phone in a pocket should be woken by
    // a push, not by a request every five seconds all shift.
    if (state == AppLifecycleState.resumed) {
      widget.feed.start();
    } else if (state == AppLifecycleState.paused) {
      widget.feed.stop();
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
                    onSignOut: widget.sessions.signOut,
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
              if (!feed.reachable) ...[
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

  /// Two letters from the nurse's name, as the design's avatar chip shows.
  String get _initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    if (parts.isEmpty) return '—';
    if (parts.length == 1)
      return parts.first.characters.take(2).toString().toUpperCase();
    return (parts.first.characters.first + parts.last.characters.first)
        .toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return Row(
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: T.sky500.withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: T.sky400.withValues(alpha: 0.30)),
          ),
          child: Icon(Icons.local_hospital, size: 19, color: p.accent),
        ),
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
                  SizedBox(width: 5),
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
          padding: const EdgeInsets.fromLTRB(6, 4, 12, 4),
          decoration: BoxDecoration(
            color: p.card,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: p.border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 24,
                height: 24,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: T.sky500.withValues(alpha: 0.20),
                  shape: BoxShape.circle,
                  border: Border.all(color: T.sky400.withValues(alpha: 0.30)),
                ),
                child: Text(
                  _initials,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: p.accent,
                  ),
                ),
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
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.check_circle_outline, size: 46, color: T.emerald400),
          SizedBox(height: 14),
          Text(
            'Faol chaqiruv yo‘q',
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: p.text1,
            ),
          ),
          SizedBox(height: 6),
          Text(
            'Yangi chaqiruv kelsa shu yerda chiqadi',
            style: TextStyle(fontSize: 13, color: p.text3),
          ),
        ],
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
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 10),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _item(p, 0, Icons.notifications_active, 'Chaqiruvlar', badge),
              _item(p, 1, Icons.account_circle, 'Profil', 0),
            ],
          ),
        ),
      ),
    );
  }

  Widget _item(Palette p, int i, IconData icon, String label, int count) {
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
              Icon(icon, size: 26, color: tint),
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

class _ProfileTab extends StatelessWidget {
  const _ProfileTab({
    required this.session,
    required this.stats,
    required this.onSignOut,
  });

  final Session? session;
  final ShiftStats stats;
  final Future<void> Function() onSignOut;

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
      children: [
        Center(
          child: Container(
            width: 76,
            height: 76,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: T.sky500.withValues(alpha: 0.15),
              shape: BoxShape.circle,
              border: Border.all(color: T.sky400.withValues(alpha: 0.35)),
            ),
            child: Icon(Icons.person, size: 38, color: p.accent),
          ),
        ),
        const SizedBox(height: 14),
        Text(
          session?.name.isNotEmpty == true ? session!.name : 'Hamshira',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: p.text1,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          switch (session?.role) {
            'nurse' => 'Hamshira',
            'admin' => 'Klinika administratori',
            _ => '',
          },
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 13, color: p.text3),
        ),
        const SizedBox(height: 24),
        _StatsStrip(stats: stats),
        const SizedBox(height: 24),
        SizedBox(
          height: 52,
          child: OutlinedButton.icon(
            onPressed: onSignOut,
            icon: const Icon(Icons.logout, size: 19),
            label: const Text(
              'Chiqish',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
            ),
            style: OutlinedButton.styleFrom(
              foregroundColor: T.red400,
              side: BorderSide(color: T.red500.withValues(alpha: 0.5)),
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
    );
  }
}
