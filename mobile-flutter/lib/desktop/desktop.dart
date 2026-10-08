import 'package:flutter/foundation.dart';

/// True on the Windows desk build: a PC at the nurses' station rather than a
/// phone in a pocket.
///
/// The differences that follow from it are few but load-bearing. There is no
/// push (Firebase Messaging does not exist on Windows), so the live socket and
/// the poll are the only way a call arrives, and they must keep running while
/// the window is minimised. There is no foreground service, so the app plays
/// the chime itself. And there is no watch to pair with.
///
/// Read from [defaultTargetPlatform] rather than `dart:io` so a test can switch
/// it with `debugDefaultTargetPlatformOverride`.
bool get isDesktop =>
    !kIsWeb && defaultTargetPlatform == TargetPlatform.windows;
