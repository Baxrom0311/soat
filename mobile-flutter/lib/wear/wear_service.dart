import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// What the ward watch is doing, as far as this phone can tell.
@immutable
class WatchState {
  const WatchState({required this.names, required this.tokenSent});

  /// Display names of the watches reachable over Bluetooth right now.
  final List<String> names;

  /// Whether this phone has successfully handed its session to a watch since
  /// the app was last started. Deliberately not persisted: the only honest
  /// answer after a restart is "not since I started", because a watch that was
  /// signed in yesterday may have been handed to another ward overnight.
  final bool tokenSent;

  bool get connected => names.isNotEmpty;

  static const none = WatchState(names: [], tokenSent: false);

  WatchState copyWith({List<String>? names, bool? tokenSent}) => WatchState(
    names: names ?? this.names,
    tokenSent: tokenSent ?? this.tokenSent,
  );
}

/// Hands the nurse's session to the ward watch over Bluetooth.
///
/// The watch can sign in by itself, and does when there is no phone to hand it
/// a token. But typing an email address and a password on a 45mm screen is a
/// genuinely bad minute, and it recurs: these watches are passed from one shift
/// to the next, and whoever is holding one is the person the call history will
/// name. Sending the token means the nurse signs in once, on the phone.
///
/// This existed in the previous app generation and was dropped in the Flutter
/// rewrite, so every watch has had to be signed in by hand since. One clinic's
/// entire history is attributed to a single shared watch account as a result --
/// 283 acknowledgements, not one of them naming a person.
class WearService {
  WearService({MethodChannel? channel})
    : _channel = channel ?? const MethodChannel('uz.boos.nursecall/wear');

  final MethodChannel _channel;

  WatchState _state = WatchState.none;
  WatchState get state => _state;

  /// Asks which watches are reachable. Safe to call often; costs a Bluetooth
  /// round trip, so it is called when a screen opens rather than on a timer.
  Future<WatchState> refresh() async {
    try {
      final names = await _channel.invokeListMethod<String>('connectedWatches');
      _state = _state.copyWith(names: names ?? const []);
    } on PlatformException catch (e) {
      debugPrint('Soatni so‘rab bo‘lmadi: ${e.message}');
      _state = _state.copyWith(names: const []);
    } on MissingPluginException {
      // iOS, or a build without the bridge. Not an error worth surfacing: there
      // is simply no watch here.
      _state = _state.copyWith(names: const []);
    }
    return _state;
  }

  /// Sends [token] to every connected watch. Returns false when no watch took
  /// it, including when there was none to send to.
  Future<bool> sendToken(String token) async {
    try {
      final ok =
          await _channel.invokeMethod<bool>('sendToken', {'token': token}) ??
          false;
      _state = _state.copyWith(tokenSent: ok);
      return ok;
    } on PlatformException catch (e) {
      debugPrint('Soatga token yuborilmadi: ${e.message}');
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  /// Signs the watch out, by sending an empty token.
  ///
  /// Matters more here than on the phone. A watch left signed in as the nurse
  /// who went home will keep acknowledging calls in her name, and on a shared
  /// ward watch that is not a hypothetical -- it is what happens every shift
  /// change unless something clears it.
  Future<bool> signOutWatch() async {
    final ok = await sendToken('');
    _state = _state.copyWith(tokenSent: false);
    return ok;
  }
}
