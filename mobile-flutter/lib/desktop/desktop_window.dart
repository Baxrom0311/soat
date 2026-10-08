import 'package:flutter/material.dart';
import 'package:window_manager/window_manager.dart';

import '../theme/tokens.dart';

/// Window behaviour for the Windows desk build.
///
/// The one rule that matters: closing the window must not quietly stop the
/// alarm. On a phone the push path rings whatever the app is doing; on a PC
/// this process *is* the alarm, so the close button asks first and offers to
/// minimise instead.
class DesktopWindow with WindowListener {
  DesktopWindow(this.navigatorKey);

  final GlobalKey<NavigatorState> navigatorKey;
  bool _asking = false;

  Future<void> init() async {
    await windowManager.ensureInitialized();
    await windowManager.setTitle('NurseCall');
    await windowManager.setMinimumSize(const Size(400, 640));
    await windowManager.setPreventClose(true);
    windowManager.addListener(this);
  }

  @override
  Future<void> onWindowClose() async {
    final context = navigatorKey.currentContext;
    if (context == null) return windowManager.destroy();
    if (_asking) return;
    _asking = true;
    final quit = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Dasturni yopasizmi?'),
        content: const Text(
          'Yopilsa, bu kompyuter chaqiruvlarda signal bermaydi. '
          'Oyna kichraytirilsa, signal ishlashda davom etadi.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: T.red600),
            child: const Text('Yopish'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Kichraytirish'),
          ),
        ],
      ),
    );
    _asking = false;
    if (quit == true) {
      await windowManager.destroy();
    } else if (quit == false) {
      await windowManager.minimize();
    }
  }
}
