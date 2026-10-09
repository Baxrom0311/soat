import 'package:flutter/material.dart';
import 'package:window_manager/window_manager.dart';

import '../calls/alarm_service.dart';
import '../theme/tokens.dart';

/// Window behaviour for the Windows desk build.
///
/// Two rules matter. Closing the window must not quietly stop the alarm: on a
/// phone the push path rings whatever the app is doing; on a PC this process
/// *is* the alarm, so the close button asks first and offers to minimise
/// instead. And while a call is ringing, the window must not just look
/// frontmost -- it must actually hold input focus, or the nurse's first click
/// on Tasdiqlash only re-focuses the window (Windows' own anti-focus-stealing
/// behaviour) and the tap itself is lost, which reads as the button being
/// unresponsive at the one moment it matters most.
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

  @override
  Future<void> onWindowBlur() async {
    // setAlwaysOnTop keeps the window visually frontmost, but a click on some
    // other app still takes OS input focus away from it silently -- nothing
    // else notices. If a call is still ringing, pull focus straight back so
    // the very next click lands on the button instead of merely refocusing
    // the window.
    if (AlarmService.instance.isPlaying) {
      await windowManager.focus();
    }
  }
}
