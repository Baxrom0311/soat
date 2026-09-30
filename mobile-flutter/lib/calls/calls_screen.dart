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
    final feed = widget.feed;
    final session = widget.sessions.session;

    return Scaffold(
      backgroundColor: T.page,
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
    final floors = {for (final c in feed.calls) c.floor}.toList()..sort();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _Header(name: session?.name ?? ''),
              if (!feed.reachable) ...[
                const SizedBox(height: 12),
                const _Banner(
                  icon: Icons.cloud_off,
                  tint: T.red500,
                  bg: T.red950,
                  text: 'Serverga ulanib bo‘lmadi — ro‘yxat eskirgan bo‘lishi mumkin',
                ),
              ],
              if (feed.notice case final n? when n.warn || n.blocked) ...[
                const SizedBox(height: 12),
                _Banner(
                  icon: Icons.warning_amber_rounded,
                  tint: T.amber400,
                  bg: T.amber950,
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
                      backgroundColor: T.slate900,
                      color: T.sky400,
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                        physics: const AlwaysScrollableScrollPhysics(),
                        itemCount: _visible.length,
                        itemBuilder: (_, i) {
                          final c = _visible[i];
                          return CallCard(
                            call: c,
                            now: feed.now,
                            busy: _busyCallId == c.callId,
                            onAcknowledge: () => _ack(c),
                          );
                        },
                      ),
                    ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: _StatsStrip(stats: feed.stats),
        ),
      ],
    );
  }
}

// --------------------------------------------------------------------- header

class _Header extends StatelessWidget {
  const _Header({required this.name});

  final String name;

  /// Two letters from the nurse's name, as the design's avatar chip shows.
  String get _initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    if (parts.isEmpty) return '—';
    if (parts.length == 1) return parts.first.characters.take(2).toString().toUpperCase();
    return (parts.first.characters.first + parts.last.characters.first).toUpperCase();
  }

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: T.sky500.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: T.sky400.withValues(alpha: 0.30)),
            ),
            child: const Icon(Icons.notifications_active,
                size: 19, color: T.sky400),
          ),
          const SizedBox(width: 10),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Faol chaqiruvlar',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: T.text1,
                    letterSpacing: -0.2,
                  ),
                ),
                Text(
                  'Navbatchilik rejimi',
                  style: TextStyle(fontSize: 11, color: T.slate500),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(6, 4, 12, 4),
            decoration: BoxDecoration(
              color: T.slate900.withValues(alpha: 0.90),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: T.slate800),
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
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: T.sky300,
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
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: T.slate200,
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

// -------------------------------------------------------------------- banners

class _Banner extends StatelessWidget {
  const _Banner({
    required this.icon,
    required this.tint,
    required this.bg,
    required this.text,
  });

  final IconData icon;
  final Color tint;
  final Color bg;
  final String text;

  @override
  Widget build(BuildContext context) => Container(
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
              child: Text(
                text,
                style: const TextStyle(fontSize: 12.5, color: T.slate200),
              ),
            ),
          ],
        ),
      );
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
  Widget build(BuildContext context) => SizedBox(
        height: 30,
        child: ListView(
          scrollDirection: Axis.horizontal,
          children: [
            _pill('Barchasi', total, selected == null, () => onSelect(null)),
            for (final f in floors)
              _pill('$f-qavat', counts[f] ?? 0, selected == f, () => onSelect(f)),
          ],
        ),
      );

  Widget _pill(String label, int count, bool on, VoidCallback tap) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: GestureDetector(
          onTap: tap,
          child: Container(
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: on ? T.sky500 : T.slate900,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: on ? T.sky500 : T.slate800),
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
                    color: on ? T.slate950 : T.slate400,
                  ),
                ),
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                  decoration: BoxDecoration(
                    color: on
                        ? T.slate950.withValues(alpha: 0.20)
                        : T.slate800.withValues(alpha: 0.80),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '$count',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: on ? T.slate950 : T.slate400,
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
  Widget build(BuildContext context) => Row(
        children: [
          Expanded(
            child: _StatCard(
              icon: Icons.speed,
              label: 'O‘rtacha javob',
              value: answerLabel(stats.typicalAnswer),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _StatCard(
              icon: Icons.task_alt,
              label: 'Bugun qabul qilindi',
              value: '${stats.answeredToday}',
              valueTint: T.emerald400,
            ),
          ),
        ],
      );
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.icon,
    required this.label,
    required this.value,
    this.valueTint,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color? valueTint;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: T.slate900.withValues(alpha: 0.80),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: T.slate800.withValues(alpha: 0.80)),
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
                    style: const TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      color: T.slate400,
                    ),
                  ),
                ),
                Icon(icon, size: 15, color: valueTint ?? T.slate400),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              value,
              style: TextStyle(
                fontFamily: T.mono,
                fontSize: 19,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.5,
                color: valueTint ?? T.text1,
              ),
            ),
          ],
        ),
      );
}

// ----------------------------------------------------------------------- misc

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) => const Center(
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
                color: T.text1,
              ),
            ),
            SizedBox(height: 6),
            Text(
              'Yangi chaqiruv kelsa shu yerda chiqadi',
              style: TextStyle(fontSize: 13, color: T.slate500),
            ),
          ],
        ),
      );
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
  Widget build(BuildContext context) => Container(
        decoration: const BoxDecoration(
          color: T.navBar,
          border: Border(top: BorderSide(color: T.slate800)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 10),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _item(0, Icons.notifications_active, 'Chaqiruvlar', badge),
                _item(1, Icons.person, 'Profil', 0),
              ],
            ),
          ),
        ),
      );

  Widget _item(int i, IconData icon, String label, int count) {
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
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(
                      color: T.red500,
                      borderRadius: BorderRadius.circular(999),
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
              color: tint,
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
  Widget build(BuildContext context) => ListView(
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
              child: const Icon(Icons.person, size: 38, color: T.sky300),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            session?.name.isNotEmpty == true ? session!.name : 'Hamshira',
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: T.text1,
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
            style: const TextStyle(fontSize: 13, color: T.slate500),
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
          const Text(
            'Chiqsangiz bu telefon chaqiruv bildirishnomalarini olmay qoladi.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11.5, color: T.slate500),
          ),
        ],
      );
}
