import 'package:flutter/material.dart';

import '../api/client.dart';
import '../api/models.dart';
import '../theme/tokens.dart';
import 'admin_screen.dart';

/// The clinic's rooms, grouped by floor.
///
/// Rooms come before everything else during an installation: a button cannot be
/// paired without one, and a nurse's floor assignment means nothing until there
/// are floors with rooms on them. So this screen exists mostly to be used once,
/// quickly, while walking a corridor.
class RoomsScreen extends StatelessWidget {
  const RoomsScreen({super.key, required this.api});

  final ApiClient api;

  @override
  Widget build(BuildContext context) => AdminList<Room>(
    title: 'Xonalar',
    load: () async {
      final rooms = await api.rooms();
      return [...rooms]..sort((a, b) {
        final f = a.floor.compareTo(b.floor);
        if (f != 0) return f;
        // Numeric where both are numbers, so 10 sorts after 9 rather than
        // between 1 and 2. Falls back to text for names like "304a".
        final an = int.tryParse(a.roomNumber);
        final bn = int.tryParse(b.roomNumber);
        if (an != null && bn != null) return an.compareTo(bn);
        return a.roomNumber.compareTo(b.roomNumber);
      });
    },
    empty:
        'Hali xona qo‘shilmagan.\nTugmani biriktirish uchun avval xona kerak.',
    action: (context, reload) => FloatingActionButton.extended(
      onPressed: () => _add(context, api, reload),
      backgroundColor: Palette.of(context).accent,
      foregroundColor: Colors.white,
      icon: const Icon(Icons.add),
      label: const Text('Xona qo‘shish'),
    ),
    itemBuilder: (context, room, reload) =>
        _RoomRow(room: room, api: api, reload: reload),
  );

  static Future<void> _add(
    BuildContext context,
    ApiClient api,
    VoidCallback reload,
  ) async {
    final result = await showDialog<({String number, int floor})>(
      context: context,
      builder: (_) => const _RoomDialog(),
    );
    if (result == null) return;
    try {
      await api.createRoom(number: result.number, floor: result.floor);
      reload();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Xona qo‘shib bo‘lmadi')));
      }
    }
  }
}

class _RoomRow extends StatelessWidget {
  const _RoomRow({required this.room, required this.api, required this.reload});

  final Room room;
  final ApiClient api;
  final VoidCallback reload;

  Future<void> _delete(BuildContext context) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('${room.roomNumber}-xona o‘chirilsinmi?'),
        // Says what actually breaks. "Are you sure?" tells somebody nothing
        // they can use to decide.
        content: const Text(
          'Bu xonaga biriktirilgan tugma bosilganda chaqiruv yaratilmaydi. '
          'Xonaning o‘tgan chaqiruvlari tarixda qoladi.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Bekor qilish'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('O‘chirish'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await api.deleteRoom(room.id);
      reload();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('O‘chirib bo‘lmadi')));
      }
    }
  }

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
              child: Text(
                '${room.roomNumber}-xona',
                style: TextStyle(
                  color: p.text1,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            Text(
              '${room.floor}-qavat',
              style: TextStyle(color: p.text3, fontSize: 13),
            ),
            IconButton(
              onPressed: () => _delete(context),
              icon: Icon(Icons.delete_outline, size: 20, color: p.text3),
            ),
          ],
        ),
      ),
    );
  }
}

class _RoomDialog extends StatefulWidget {
  const _RoomDialog();

  @override
  State<_RoomDialog> createState() => _RoomDialogState();
}

class _RoomDialogState extends State<_RoomDialog> {
  final _number = TextEditingController();
  final _floor = TextEditingController(text: '1');
  String? _error;

  @override
  void dispose() {
    _number.dispose();
    _floor.dispose();
    super.dispose();
  }

  void _submit() {
    final number = _number.text.trim();
    final floor = int.tryParse(_floor.text.trim());
    if (number.isEmpty) {
      setState(() => _error = 'Xona raqamini kiriting');
      return;
    }
    if (floor == null || floor < 0) {
      setState(() => _error = 'Qavatni raqam bilan kiriting');
      return;
    }
    Navigator.pop(context, (number: number, floor: floor));
  }

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return AlertDialog(
      backgroundColor: p.card,
      title: const Text('Yangi xona'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _number,
            autofocus: true,
            decoration: const InputDecoration(labelText: 'Xona raqami'),
            onSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _floor,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: 'Qavat'),
            onSubmitted: (_) => _submit(),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                _error!,
                style: TextStyle(color: p.dangerInk, fontSize: 13),
              ),
            ),
          ],
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Bekor qilish'),
        ),
        TextButton(onPressed: _submit, child: const Text('Qo‘shish')),
      ],
    );
  }
}
