import 'package:flutter/material.dart';

import '../api/client.dart';
import '../api/models.dart';
import 'shift_stats.dart';
import '../theme/tokens.dart';

/// What happened on this ward, most recent first.
///
/// The app had been downloading this list since the beginning and showing only
/// two numbers from it. Everything else -- which room, who went, how long the
/// patient waited, and which calls nobody ever answered -- was thrown away.
///
/// That last group is the reason this screen is worth having. Calls now close
/// themselves after twelve hours as `expired`, and an expired call is the
/// clearest signal the system produces: somebody pressed a button and no nurse
/// ever came. It is not visible anywhere else on a phone.
class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key, required this.api});

  final ApiClient api;

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

enum _Filter { all, unanswered, mine }

class _HistoryScreenState extends State<HistoryScreen> {
  List<HistoryCall>? _rows;
  String? _error;
  _Filter _filter = _Filter.all;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final rows = await widget.api.history(limit: 200);
      // Newest first. The server already orders by created_at desc, but the
      // screen should not depend on that: a list that silently reorders itself
      // because a query changed is a confusing thing to debug on a ward.
      final sorted = [...rows]
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
      if (mounted) setState(() => _rows = sorted);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(
        () => _error = e.status == 402
            // The one error worth spelling out: history is billing-gated while
            // the call list is not, so this is a bill, not a breakage.
            ? 'Obuna to‘lanmagani uchun tarix ko‘rinmaydi.\nChaqiruvlar ishlashda davom etadi.'
            : e.message,
      );
    } catch (_) {
      if (mounted) setState(() => _error = 'Serverga ulanib bo‘lmadi');
    }
  }

  List<HistoryCall> get _visible {
    final rows = _rows ?? const <HistoryCall>[];
    return switch (_filter) {
      _Filter.all => rows,
      _Filter.unanswered => rows.where((r) => !r.answered).toList(),
      _Filter.mine => rows.where((r) => r.answered).toList(),
    };
  }

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    final rows = _rows;
    final unanswered = rows?.where((r) => !r.answered).length ?? 0;

    return Scaffold(
      backgroundColor: p.page,
      appBar: AppBar(
        backgroundColor: p.navBar,
        surfaceTintColor: Colors.transparent,
        foregroundColor: p.text1,
        elevation: 0,
        shape: Border(bottom: BorderSide(color: p.border)),
        title: const Text(
          'Chaqiruvlar tarixi',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        ),
      ),
      body: SafeArea(
        top: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (rows != null && rows.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: Row(
                      children: [
                        _Chip(
                          label: 'Hammasi',
                          count: rows.length,
                          on: _filter == _Filter.all,
                          onTap: () => setState(() => _filter = _Filter.all),
                        ),
                        const SizedBox(width: 8),
                        _Chip(
                          label: 'Javobsiz',
                          count: unanswered,
                          // Only ever tinted when there is something to tint:
                          // a red zero trains people to ignore the colour.
                          danger: unanswered > 0,
                          on: _filter == _Filter.unanswered,
                          onTap: () =>
                              setState(() => _filter = _Filter.unanswered),
                        ),
                        const SizedBox(width: 8),
                        _Chip(
                          label: 'Javob berilgan',
                          count: rows.length - unanswered,
                          on: _filter == _Filter.mine,
                          onTap: () => setState(() => _filter = _Filter.mine),
                        ),
                      ],
                    ),
                  ),
                Expanded(child: _body(p, rows)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _body(Palette p, List<HistoryCall>? rows) {
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.info_outline, size: 38, color: p.text3),
              const SizedBox(height: 14),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: TextStyle(color: p.text2, fontSize: 14.5, height: 1.5),
              ),
              const SizedBox(height: 18),
              TextButton(onPressed: _load, child: const Text('Qayta urinish')),
            ],
          ),
        ),
      );
    }
    if (rows == null) {
      return const Center(child: CircularProgressIndicator());
    }
    final visible = _visible;
    if (visible.isEmpty) {
      return Center(
        child: Text(
          rows.isEmpty ? 'Hali chaqiruv bo‘lmagan' : 'Bu turdagi chaqiruv yo‘q',
          style: TextStyle(color: p.text3, fontSize: 15),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      backgroundColor: p.card,
      color: T.sky400,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: visible.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (_, i) => _Row(row: visible[i]),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.row});

  final HistoryCall row;

  /// Local time, since a nurse reading this is standing in the building.
  static String _clock(DateTime t) {
    final l = t.toLocal();
    return '${l.hour.toString().padLeft(2, '0')}:'
        '${l.minute.toString().padLeft(2, '0')}';
  }

  static String _day(DateTime t) {
    final l = t.toLocal();
    final today = DateTime.now();
    if (l.year == today.year && l.month == today.month && l.day == today.day) {
      return 'Bugun';
    }
    final yesterday = today.subtract(const Duration(days: 1));
    if (l.year == yesterday.year &&
        l.month == yesterday.month &&
        l.day == yesterday.day) {
      return 'Kecha';
    }
    return '${l.day.toString().padLeft(2, '0')}.'
        '${l.month.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    final answered = row.answered;
    // Three states, three inks. Unanswered is the one that should catch the eye.
    final tint = answered ? p.accentOk : p.dangerInk;

    return Container(
      decoration: BoxDecoration(
        color: p.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: p.border),
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: tint.withValues(alpha: 0.13),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Icon(
              answered ? Icons.check_rounded : Icons.notifications_off_outlined,
              size: 19,
              color: tint,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${row.roomNumber}-xona',
                        style: TextStyle(
                          color: p.text1,
                          fontSize: 15.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    Text(
                      '${_day(row.createdAt)}, ${_clock(row.createdAt)}',
                      style: TextStyle(
                        color: p.text3,
                        fontSize: 12.5,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  answered
                      // answerLabel, not the card's mm:ss counter: "15:38"
                      // sitting next to "Kecha, 17:39" reads as a clock time,
                      // which is a different fact entirely. "15m 38s" cannot.
                      ? '${answerLabel(row.answeredIn)} ichida — ${row.acknowledgedBy ?? "javob berildi"}'
                      : row.expired
                      // Says what happened rather than what the database calls
                      // it. "Expired" is a status; this is a patient nobody went to.
                      ? 'Hech kim javob bermagan'
                      : 'Hali kutmoqda',
                  style: TextStyle(
                    color: answered ? p.text2 : p.dangerInk,
                    fontSize: 13,
                    fontWeight: answered ? FontWeight.w400 : FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.count,
    required this.on,
    required this.onTap,
    this.danger = false,
  });

  final String label;
  final int count;
  final bool on;
  final bool danger;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    final tint = danger ? p.dangerInk : p.accent;
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Container(
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: on ? tint.withValues(alpha: 0.14) : p.card,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: on ? tint : p.border),
          ),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              child: Text(
                '$label · $count',
                style: TextStyle(
                  color: on ? tint : p.text2,
                  fontSize: 12.5,
                  fontWeight: on ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
