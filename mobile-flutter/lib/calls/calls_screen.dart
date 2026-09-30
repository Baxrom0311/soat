import 'package:flutter/material.dart';

import '../api/models.dart';
import '../auth/session_store.dart';
import '../theme/tokens.dart';
import 'call_card.dart';
import 'calls_feed.dart';

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
    // a push, not by a request every five seconds all shift — and a stale list
    // is corrected the moment the nurse looks at it again.
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
            backgroundColor: T.danger,
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
    final name = widget.sessions.session?.name ?? '';
    final floors = {for (final c in feed.calls) c.floor}.toList()..sort();

    return Scaffold(
      backgroundColor: T.page,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Header(name: name, onSignOut: widget.sessions.signOut),
            if (!feed.reachable) const _OfflineBar(),
            if (feed.notice case final n? when n.warn || n.blocked)
              _BillingBar(notice: n),
            if (floors.length > 1)
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
            Expanded(
              child: feed.loading
                  ? const Center(child: CircularProgressIndicator())
                  : _visible.isEmpty
                      ? const _Empty()
                      : RefreshIndicator(
                          onRefresh: feed.refresh,
                          child: ListView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
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
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.name, required this.onSignOut});

  final String name;
  final Future<void> Function() onSignOut;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(18, 14, 10, 10),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Faol chaqiruvlar',
                    style: TextStyle(
                      color: T.text1,
                      fontSize: 21,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  if (name.isNotEmpty)
                    Text(
                      name,
                      style: const TextStyle(color: T.text3, fontSize: 13),
                    ),
                ],
              ),
            ),
            IconButton(
              onPressed: onSignOut,
              icon: const Icon(Icons.logout, color: T.text3),
              tooltip: 'Chiqish',
            ),
          ],
        ),
      );
}

class _OfflineBar extends StatelessWidget {
  const _OfflineBar();

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: T.danger.withValues(alpha: 0.14),
          border: Border.all(color: T.danger.withValues(alpha: 0.5)),
          borderRadius: BorderRadius.circular(12),
        ),
        // Said out loud because an unreachable server and a quiet ward look
        // identical on this screen: both are an empty list.
        child: const Row(
          children: [
            Icon(Icons.cloud_off, size: 18, color: T.danger),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'Serverga ulanib bo‘lmadi — ro‘yxat eskirgan bo‘lishi mumkin',
                style: TextStyle(color: T.text1, fontSize: 13),
              ),
            ),
          ],
        ),
      );
}

class _BillingBar extends StatelessWidget {
  const _BillingBar({required this.notice});

  final BillingNotice notice;

  @override
  Widget build(BuildContext context) {
    final text = notice.blocked
        ? 'Obuna to‘lanmagan. Chaqiruvlar ishlashda davom etadi.'
        : notice.daysLeft != null
            ? 'Obuna muddati tugayapti: ${notice.daysLeft} kun qoldi'
            : 'Obuna muddati tugayapti';
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: T.warn.withValues(alpha: 0.13),
        border: Border.all(color: T.warn.withValues(alpha: 0.45)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline, size: 18, color: T.warn),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(color: T.text1, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}

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
        height: 42,
        child: ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          children: [
            _pill('Barchasi ($total)', selected == null, () => onSelect(null)),
            for (final f in floors)
              _pill(
                '$f-qavat (${counts[f]})',
                selected == f,
                () => onSelect(f),
              ),
          ],
        ),
      );

  Widget _pill(String label, bool on, VoidCallback tap) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: GestureDetector(
          onTap: tap,
          child: Container(
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: on ? T.step1.withValues(alpha: 0.18) : T.cardSoft,
              border: Border.all(
                color: on ? T.step1 : T.border,
              ),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              label,
              style: TextStyle(
                color: on ? T.step1 : T.text2,
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      );
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) => const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.check_circle_outline, size: 46, color: T.ok),
            SizedBox(height: 14),
            Text(
              'Faol chaqiruv yo‘q',
              style: TextStyle(
                color: T.text1,
                fontSize: 17,
                fontWeight: FontWeight.w700,
              ),
            ),
            SizedBox(height: 6),
            Text(
              'Yangi chaqiruv kelsa shu yerda chiqadi',
              style: TextStyle(color: T.text3, fontSize: 13),
            ),
          ],
        ),
      );
}
