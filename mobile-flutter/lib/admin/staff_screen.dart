import 'package:flutter/material.dart';

import '../api/client.dart';
import '../api/models.dart';
import '../theme/tokens.dart';
import 'admin_screen.dart';

/// Who works here, and which floors their phone rings for.
///
/// The floor assignment is the part that matters day to day, because it is the
/// only setting in the whole system that decides whose phone stays silent. An
/// empty assignment means every floor -- the server's safe default, so a nurse
/// who has not been set up yet receives everything rather than nothing -- and
/// that is said in words on each row, because "no floors" looks like the
/// opposite of what it means.
class StaffScreen extends StatelessWidget {
  const StaffScreen({super.key, required this.api});

  final ApiClient api;

  @override
  Widget build(BuildContext context) => AdminList<Staff>(
    title: 'Hamshiralar',
    load: () async {
      final staff = await api.staff();
      // Admins last: on this screen the nurses are what is being managed.
      return [...staff]..sort((a, b) {
        if (a.isAdmin != b.isAdmin) return a.isAdmin ? 1 : -1;
        return a.name.toLowerCase().compareTo(b.name.toLowerCase());
      });
    },
    empty: 'Hali xodim qo‘shilmagan.',
    action: (context, reload) => FloatingActionButton.extended(
      onPressed: () => _add(context, api, reload),
      backgroundColor: Palette.of(context).accent,
      foregroundColor: Colors.white,
      icon: const Icon(Icons.person_add),
      label: const Text('Hamshira qo‘shish'),
    ),
    itemBuilder: (context, staff, reload) =>
        _StaffRow(staff: staff, api: api, reload: reload),
  );

  static Future<void> _add(
    BuildContext context,
    ApiClient api,
    VoidCallback reload,
  ) async {
    final result = await showDialog<_NewStaff>(
      context: context,
      builder: (_) => const _StaffDialog(),
    );
    if (result == null) return;
    try {
      await api.createStaff(
        name: result.name,
        email: result.email,
        password: result.password,
        role: 'nurse',
      );
      reload();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            // The password is shown once, here, because the admin has to pass
            // it on and the server never reveals it again.
            content: Text(
              '${result.name} qo‘shildi — parol: ${result.password}',
            ),
            duration: const Duration(seconds: 8),
          ),
        );
      }
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
        ).showSnackBar(const SnackBar(content: Text('Qo‘shib bo‘lmadi')));
      }
    }
  }
}

class _StaffRow extends StatelessWidget {
  const _StaffRow({
    required this.staff,
    required this.api,
    required this.reload,
  });

  final Staff staff;
  final ApiClient api;
  final VoidCallback reload;

  Future<void> _editFloors(BuildContext context) async {
    List<Room> rooms;
    try {
      rooms = await api.rooms();
    } catch (_) {
      rooms = const [];
    }
    final floors = {for (final r in rooms) r.floor}.toList()..sort();
    if (!context.mounted) return;
    if (floors.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Avval xona qo‘shing — qavatlar shundan olinadi'),
        ),
      );
      return;
    }

    final chosen = await showDialog<List<int>>(
      context: context,
      builder: (_) => _FloorsDialog(all: floors, selected: staff.floors),
    );
    if (chosen == null || !context.mounted) return;
    try {
      await api.setStaffFloors(staff.id, chosen);
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
        ).showSnackBar(const SnackBar(content: Text('Saqlab bo‘lmadi')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: p.card,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: staff.isAdmin ? null : () => _editFloors(context),
          borderRadius: BorderRadius.circular(12),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: p.border),
            ),
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              staff.name.isEmpty ? staff.email : staff.name,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: p.text1,
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          if (staff.isAdmin) ...[
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 7,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: p.accent.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                'admin',
                                style: TextStyle(
                                  color: p.accent,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 3),
                      Text(
                        staff.isAdmin
                            ? staff.email
                            : staff.allFloors
                            // Spelled out: an empty list means everything, and
                            // a blank row would read as "receives nothing".
                            ? 'Barcha qavatlar'
                            : '${staff.floors.join(", ")}-qavat',
                        style: TextStyle(color: p.text3, fontSize: 12.5),
                      ),
                    ],
                  ),
                ),
                if (!staff.isAdmin)
                  Icon(Icons.layers, size: 19, color: p.text3),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

typedef _NewStaff = ({String name, String email, String password});

class _StaffDialog extends StatefulWidget {
  const _StaffDialog();

  @override
  State<_StaffDialog> createState() => _StaffDialogState();
}

class _StaffDialogState extends State<_StaffDialog> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  void _submit() {
    final name = _name.text.trim();
    final email = _email.text.trim();
    final password = _password.text;
    if (name.isEmpty) {
      setState(() => _error = 'Ismni kiriting');
      return;
    }
    if (!email.contains('@')) {
      setState(() => _error = 'Email manzilini to‘liq kiriting');
      return;
    }
    if (password.length < 8) {
      setState(() => _error = 'Parol kamida 8 ta belgi bo‘lsin');
      return;
    }
    Navigator.pop(context, (name: name, email: email, password: password));
  }

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return AlertDialog(
      backgroundColor: p.card,
      title: const Text('Yangi hamshira'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _name,
              autofocus: true,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Ism familiya'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _password,
              decoration: const InputDecoration(
                labelText: 'Boshlang‘ich parol',
              ),
              onSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Hamshira ilovaga kirgach parolni o‘zi o‘zgartira oladi.',
                style: TextStyle(color: p.text3, fontSize: 12.5, height: 1.4),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
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

class _FloorsDialog extends StatefulWidget {
  const _FloorsDialog({required this.all, required this.selected});

  final List<int> all;
  final List<int> selected;

  @override
  State<_FloorsDialog> createState() => _FloorsDialogState();
}

class _FloorsDialogState extends State<_FloorsDialog> {
  late final Set<int> _chosen = {...widget.selected};

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return AlertDialog(
      backgroundColor: p.card,
      title: const Text('Qaysi qavatlar'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _chosen.isEmpty
                  ? 'Hech biri tanlanmasa — barcha qavatlarning chaqiruvi keladi.'
                  : 'Faqat tanlangan qavatlarning chaqiruvi keladi.',
              style: TextStyle(color: p.text3, fontSize: 12.5, height: 1.4),
            ),
            const SizedBox(height: 10),
            for (final floor in widget.all)
              CheckboxListTile(
                value: _chosen.contains(floor),
                onChanged: (on) => setState(() {
                  if (on == true) {
                    _chosen.add(floor);
                  } else {
                    _chosen.remove(floor);
                  }
                }),
                title: Text('$floor-qavat'),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                dense: true,
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Bekor qilish'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context, _chosen.toList()..sort()),
          child: const Text('Saqlash'),
        ),
      ],
    );
  }
}
