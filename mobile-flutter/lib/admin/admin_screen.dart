import 'package:flutter/material.dart';

import '../api/client.dart';
import '../api/models.dart';
import '../theme/tokens.dart';
import 'buttons_screen.dart';
import 'devices_screen.dart';
import 'rooms_screen.dart';
import 'staff_screen.dart';

/// The clinic admin's half of the app.
///
/// All of this existed only in the web dashboard, which is the wrong place for
/// most of it: the person who installs a receiver or pairs a button is standing
/// in the room holding a phone, not sitting at a laptop. Pairing in particular
/// is a two-handed job -- press the button, see the code appear, assign it --
/// and doing it from the room it belongs to removes the step where you write
/// the number down and get it wrong.
///
/// Reachable only for an admin session. The routes are admin-only on the server
/// too, so this is a courtesy rather than the enforcement.
class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key, required this.api});

  final ApiClient api;

  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  int? _offline;
  int? _unpaired;
  int? _roomCount;
  int? _staffCount;

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// Loads the four counts shown on the rows. Each is allowed to fail on its
  /// own: a count that cannot be fetched shows nothing rather than stopping the
  /// menu from opening.
  Future<void> _load() async {
    final results = await Future.wait([
      widget.api.devices().then<Object?>((d) => d).catchError((_) => null),
      widget.api
          .unassignedSignals()
          .then<Object?>((s) => s)
          .catchError((_) => null),
      widget.api.rooms().then<Object?>((r) => r).catchError((_) => null),
      widget.api.staff().then<Object?>((s) => s).catchError((_) => null),
    ]);
    if (!mounted) return;
    setState(() {
      final devices = results[0] as List<Device>?;
      _offline = devices?.where((d) => !d.online).length;
      _unpaired = (results[1] as List<UnassignedSignal>?)?.length;
      _roomCount = (results[2] as List<Room>?)?.length;
      _staffCount = (results[3] as List<Staff>?)?.length;
    });
  }

  Future<void> _open(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
    // Counts change behind these screens -- a button paired here is one fewer
    // unpaired signal -- so they are re-read on the way back rather than left
    // showing what was true when the menu opened.
    _load();
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
          'Klinika sozlamalari',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        ),
      ),
      body: SafeArea(
        top: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: RefreshIndicator(
              onRefresh: _load,
              backgroundColor: p.card,
              color: T.sky400,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  AdminTile(
                    icon: Icons.router,
                    label: 'Qabul qilgichlar',
                    sub: 'Qaysi biri ishlayapti, qaysi biri jim',
                    // The one count that is an alarm rather than information:
                    // a silent receiver means a ward where pressing the button
                    // does nothing, and nobody finds out until it is needed.
                    badge: (_offline ?? 0) > 0 ? '$_offline jim' : null,
                    danger: true,
                    onTap: () => _open(DevicesScreen(api: widget.api)),
                  ),
                  AdminTile(
                    icon: Icons.radio_button_checked,
                    label: 'Tugmalar',
                    sub: 'Yangi tugmani xonaga biriktirish',
                    badge: (_unpaired ?? 0) > 0 ? '$_unpaired yangi' : null,
                    onTap: () => _open(ButtonsScreen(api: widget.api)),
                  ),
                  AdminTile(
                    icon: Icons.meeting_room,
                    label: 'Xonalar',
                    sub: _roomCount == null ? '' : '$_roomCount ta xona',
                    onTap: () => _open(RoomsScreen(api: widget.api)),
                  ),
                  AdminTile(
                    icon: Icons.groups,
                    label: 'Hamshiralar',
                    sub: _staffCount == null ? '' : '$_staffCount ta xodim',
                    onTap: () => _open(StaffScreen(api: widget.api)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// One row of the admin menu. Shared with nothing else, but kept public so the
/// four screens below can reuse the same shape for their own rows.
class AdminTile extends StatelessWidget {
  const AdminTile({
    super.key,
    required this.icon,
    required this.label,
    required this.sub,
    required this.onTap,
    this.badge,
    this.danger = false,
  });

  final IconData icon;
  final String label;
  final String sub;
  final String? badge;
  final bool danger;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    final tint = danger ? p.dangerInk : p.accent;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: p.card,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: p.border),
            ),
            padding: const EdgeInsets.fromLTRB(14, 15, 14, 15),
            child: Row(
              children: [
                Icon(icon, size: 22, color: p.accent),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        style: TextStyle(
                          color: p.text1,
                          fontSize: 15.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      if (sub.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          sub,
                          style: TextStyle(color: p.text3, fontSize: 13),
                        ),
                      ],
                    ],
                  ),
                ),
                if (badge != null) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: tint.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      badge!,
                      style: TextStyle(
                        color: tint,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                ],
                Icon(Icons.chevron_right, size: 20, color: p.text3),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The frame every management screen uses: a title, a list, a loading state, an
/// error state and pull-to-refresh. Written once so four screens cannot drift
/// into four slightly different ideas of what "failed to load" looks like.
// The generic is E, not T: `T` is the design-token class, and a type parameter
// with that name quietly shadows it -- which showed up as `T.sky400` failing to
// resolve inside this very file.
class AdminList<E> extends StatefulWidget {
  const AdminList({
    super.key,
    required this.title,
    required this.load,
    required this.itemBuilder,
    required this.empty,
    this.header,
    this.action,
  });

  final String title;
  final Future<List<E>> Function() load;
  final Widget Function(BuildContext context, E item, VoidCallback reload)
  itemBuilder;
  final String empty;

  /// Shown above the list, inside the refreshable area.
  final Widget Function(BuildContext context, List<E> items)? header;

  /// A floating action, when the screen can create something.
  final Widget Function(BuildContext context, VoidCallback reload)? action;

  @override
  State<AdminList<E>> createState() => AdminListState<E>();
}

class AdminListState<E> extends State<AdminList<E>> {
  List<E>? _items;
  String? _error;

  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<void> reload() async {
    try {
      final items = await widget.load();
      if (mounted) {
        setState(() {
          _items = items;
          _error = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(
          () => _error = e.status == 402
              ? 'Obuna to‘lanmagani uchun bu bo‘lim yopiq.\nChaqiruvlar ishlashda davom etadi.'
              : e.status == 403
              ? 'Bu bo‘lim faqat klinika administratori uchun'
              : e.message,
        );
      }
    } catch (_) {
      if (mounted) setState(() => _error = 'Serverga ulanib bo‘lmadi');
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    final items = _items;
    return Scaffold(
      backgroundColor: p.page,
      appBar: AppBar(
        backgroundColor: p.navBar,
        surfaceTintColor: Colors.transparent,
        foregroundColor: p.text1,
        elevation: 0,
        shape: Border(bottom: BorderSide(color: p.border)),
        title: Text(
          widget.title,
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        ),
      ),
      floatingActionButton: items == null || widget.action == null
          ? null
          : widget.action!(context, reload),
      body: SafeArea(
        top: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: _body(p, items),
          ),
        ),
      ),
    );
  }

  Widget _body(Palette p, List<E>? items) {
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
              TextButton(onPressed: reload, child: const Text('Qayta urinish')),
            ],
          ),
        ),
      );
    }
    if (items == null) return const Center(child: CircularProgressIndicator());

    return RefreshIndicator(
      onRefresh: reload,
      backgroundColor: p.card,
      color: T.sky400,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 90),
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (widget.header != null) widget.header!(context, items),
          if (items.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 60),
              child: Center(
                child: Text(
                  widget.empty,
                  textAlign: TextAlign.center,
                  style: TextStyle(color: p.text3, fontSize: 15, height: 1.5),
                ),
              ),
            )
          else
            for (final item in items) widget.itemBuilder(context, item, reload),
        ],
      ),
    );
  }
}
