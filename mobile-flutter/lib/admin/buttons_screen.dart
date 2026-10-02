import 'package:flutter/material.dart';

import '../api/client.dart';
import '../api/models.dart';
import '../theme/tokens.dart';

/// Pairing a 433MHz button to a room, which is how a button starts working.
///
/// This is the installation job, and it is the one place the phone beats the
/// laptop outright. You stand in the room, press the new button, its code
/// appears at the top of this screen within a second or two, and you assign it
/// to the room you are standing in. The laptop version of this involves reading
/// a seven-digit number off a screen in another room and typing it in, which is
/// exactly the kind of step that goes wrong.
///
/// Unpaired signals are shown first and separately. A code heard once is often
/// a neighbour's gate remote; the seen count is what tells them apart, so it is
/// on screen rather than hidden.
class ButtonsScreen extends StatefulWidget {
  const ButtonsScreen({super.key, required this.api});

  final ApiClient api;

  @override
  State<ButtonsScreen> createState() => _ButtonsScreenState();
}

class _ButtonsScreenState extends State<ButtonsScreen> {
  List<UnassignedSignal>? _signals;
  List<ButtonPairing>? _paired;
  List<Room>? _rooms;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        widget.api.unassignedSignals(),
        widget.api.buttons(),
        widget.api.rooms(),
      ]);
      if (!mounted) return;
      setState(() {
        _signals = (results[0] as List<UnassignedSignal>).toList()
          // Most recently pressed first: the one in your hand is the one you
          // are looking for.
          ..sort((a, b) => b.lastSeenAt.compareTo(a.lastSeenAt));
        _paired = (results[1] as List<ButtonPairing>).toList()
          ..sort((a, b) {
            final f = a.floor.compareTo(b.floor);
            return f != 0 ? f : a.roomNumber.compareTo(b.roomNumber);
          });
        _rooms = (results[2] as List<Room>).toList()
          ..sort((a, b) {
            final f = a.floor.compareTo(b.floor);
            return f != 0 ? f : a.roomNumber.compareTo(b.roomNumber);
          });
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(
          () => _error = e.status == 403
              ? 'Bu bo‘lim faqat klinika administratori uchun'
              : e.message,
        );
      }
    } catch (_) {
      if (mounted) setState(() => _error = 'Serverga ulanib bo‘lmadi');
    }
  }

  Future<void> _pair(UnassignedSignal signal) async {
    final rooms = _rooms ?? const <Room>[];
    if (rooms.isEmpty) {
      _say('Avval xona qo‘shing — tugmani biriktirish uchun xona kerak');
      return;
    }
    final room = await showModalBottomSheet<Room>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _RoomPicker(rooms: rooms, code: signal.code),
    );
    if (room == null || !mounted) return;

    setState(() => _busy = true);
    try {
      await widget.api.pairButton(code: signal.code, roomId: room.id);
      await _load();
      _say('${room.roomNumber}-xonaga biriktirildi');
    } on ApiException catch (e) {
      _say(e.message);
    } catch (_) {
      _say('Biriktirib bo‘lmadi');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _dismiss(UnassignedSignal signal) async {
    setState(() => _busy = true);
    try {
      await widget.api.dismissSignal(signal.id);
      await _load();
    } catch (_) {
      _say('O‘chirib bo‘lmadi');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _unpair(ButtonPairing button) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('${button.roomNumber}-xona tugmasi'),
        content: const Text(
          'Biriktirish olib tashlansa, bu tugma bosilganda chaqiruv '
          'yaratilmaydi. Davom etasizmi?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Bekor qilish'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Olib tashlash'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await widget.api.deleteButton(button.id);
      await _load();
    } catch (_) {
      _say('Olib tashlab bo‘lmadi');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _say(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return Scaffold(
      backgroundColor: p.page,
      appBar: AppBar(
        backgroundColor: p.navBar,
        surfaceTintColor: Colors.transparent,
        foregroundColor: p.text1,
        elevation: 0,
        shape: Border(bottom: BorderSide(color: p.border)),
        title: const Text(
          'Tugmalar',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        ),
      ),
      body: SafeArea(
        top: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: Stack(
              children: [
                _body(p),
                if (_busy)
                  const Positioned.fill(
                    child: ColoredBox(
                      color: Color(0x66000000),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _body(Palette p) {
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
    final signals = _signals;
    final paired = _paired;
    if (signals == null || paired == null) {
      return const Center(child: CircularProgressIndicator());
    }

    return RefreshIndicator(
      onRefresh: _load,
      backgroundColor: p.card,
      color: T.sky400,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            decoration: BoxDecoration(
              color: p.bannerBg(p.accent),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: p.accent.withValues(alpha: 0.3)),
            ),
            child: Row(
              children: [
                Icon(Icons.touch_app, size: 20, color: p.accent),
                const SizedBox(width: 11),
                Expanded(
                  child: Text(
                    'Xonada turib tugmani bosing — kodi shu yerda chiqadi, '
                    'keyin xonani tanlang.',
                    style: TextStyle(
                      color: p.text2,
                      fontSize: 13.5,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          _SectionLabel(
            text: signals.isEmpty
                ? 'Yangi tugma kutilmoqda'
                : 'Biriktirilmagan — ${signals.length} ta',
          ),
          if (signals.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(2, 6, 2, 10),
              child: Text(
                'Tugmani bosing va ro‘yxatni pastga torting.',
                style: TextStyle(color: p.text3, fontSize: 13.5),
              ),
            )
          else
            for (final s in signals)
              _SignalRow(
                signal: s,
                onPair: () => _pair(s),
                onDismiss: () => _dismiss(s),
              ),
          const SizedBox(height: 18),
          _SectionLabel(text: 'Biriktirilgan — ${paired.length} ta'),
          if (paired.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(2, 6, 2, 0),
              child: Text(
                'Hali birorta tugma biriktirilmagan.',
                style: TextStyle(color: p.text3, fontSize: 13.5),
              ),
            )
          else
            for (final b in paired)
              _PairedRow(button: b, onRemove: () => _unpair(b)),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: 2, bottom: 8),
    child: Text(
      text.toUpperCase(),
      style: TextStyle(
        color: Palette.of(context).text3,
        fontSize: 11.5,
        letterSpacing: 0.8,
        fontWeight: FontWeight.w700,
      ),
    ),
  );
}

class _SignalRow extends StatelessWidget {
  const _SignalRow({
    required this.signal,
    required this.onPair,
    required this.onDismiss,
  });

  final UnassignedSignal signal;
  final VoidCallback onPair;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    // A code heard once is usually not a button at all. Saying so is cheaper
    // than having somebody pair a neighbour's gate remote to room 304.
    final probablyNoise = signal.seenCount < 2;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        decoration: BoxDecoration(
          color: p.card,
          borderRadius: BorderRadius.circular(13),
          border: Border.all(color: p.accent.withValues(alpha: 0.4)),
        ),
        padding: const EdgeInsets.fromLTRB(14, 13, 10, 13),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${signal.code}',
                    style: TextStyle(
                      color: p.text1,
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    probablyNoise
                        ? '${signal.deviceId} · bir marta eshitilgan'
                        : '${signal.deviceId} · ${signal.seenCount} marta',
                    style: TextStyle(
                      color: probablyNoise ? p.warnInk : p.text3,
                      fontSize: 12.5,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              onPressed: onDismiss,
              tooltip: 'Bu tugma emas',
              icon: Icon(Icons.close, size: 20, color: p.text3),
            ),
            FilledButton(
              onPressed: onPair,
              style: FilledButton.styleFrom(
                backgroundColor: p.accent,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              child: const Text(
                'Biriktirish',
                style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PairedRow extends StatelessWidget {
  const _PairedRow({required this.button, required this.onRemove});

  final ButtonPairing button;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Container(
        decoration: BoxDecoration(
          color: p.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: p.border),
        ),
        padding: const EdgeInsets.fromLTRB(14, 11, 6, 11),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${button.roomNumber}-xona · ${button.floor}-qavat',
                    style: TextStyle(
                      color: p.text1,
                      fontSize: 14.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'kod ${button.code}',
                    style: TextStyle(
                      color: p.text3,
                      fontSize: 12.5,
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              onPressed: onRemove,
              icon: Icon(Icons.link_off, size: 19, color: p.text3),
            ),
          ],
        ),
      ),
    );
  }
}

/// The room list, as a sheet. Grouped by floor, because that is how somebody
/// standing in a building thinks about where they are.
class _RoomPicker extends StatelessWidget {
  const _RoomPicker({required this.rooms, required this.code});

  final List<Room> rooms;
  final int code;

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    final byFloor = <int, List<Room>>{};
    for (final r in rooms) {
      byFloor.putIfAbsent(r.floor, () => []).add(r);
    }
    final floors = byFloor.keys.toList()..sort();

    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.92,
      expand: false,
      builder: (context, controller) => Container(
        decoration: BoxDecoration(
          color: p.page,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
          border: Border.all(color: p.border),
        ),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 16, 18, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Qaysi xonaga?',
                    style: TextStyle(
                      color: p.text1,
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    'Tugma kodi $code',
                    style: TextStyle(color: p.text3, fontSize: 13),
                  ),
                ],
              ),
            ),
            Divider(height: 1, color: p.border),
            Expanded(
              child: ListView(
                controller: controller,
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 24),
                children: [
                  for (final floor in floors) ...[
                    Padding(
                      padding: const EdgeInsets.fromLTRB(4, 8, 4, 8),
                      child: Text(
                        '$floor-QAVAT',
                        style: TextStyle(
                          color: p.text3,
                          fontSize: 11.5,
                          letterSpacing: 0.8,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final room in byFloor[floor]!)
                          GestureDetector(
                            onTap: () => Navigator.pop(context, room),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 11,
                              ),
                              decoration: BoxDecoration(
                                color: p.card,
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: p.border),
                              ),
                              child: Text(
                                room.roomNumber,
                                style: TextStyle(
                                  color: p.text1,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
