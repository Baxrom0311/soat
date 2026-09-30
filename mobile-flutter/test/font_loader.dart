import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// Loads the app's real fonts into the test binding.
///
/// Without this, Flutter's test environment substitutes a fallback face whose
/// every glyph is a square of the full font size — "204" at 56px measures 168px
/// wide instead of roughly 100. Any assertion about whether text fits is then
/// answering a question about the fake font, which is how a test claiming to
/// catch a truncated room number passed against the truncating code.
Future<void> loadAppFonts() async {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final entry in {
    'Grotesk': 'assets/fonts/SpaceGrotesk.ttf',
    'Jakarta': 'assets/fonts/PlusJakartaSans.ttf',
  }.entries) {
    final bytes = await File(entry.value).readAsBytes();
    final loader = FontLoader(entry.key)
      ..addFont(Future.value(ByteData.sublistView(bytes)));
    await loader.load();
  }
}
