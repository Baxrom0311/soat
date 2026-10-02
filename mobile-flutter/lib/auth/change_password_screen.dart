import 'package:flutter/material.dart';

import '../api/client.dart';
import '../api/models.dart';
import '../theme/tokens.dart';

/// Lets a nurse change the password somebody else chose for her.
///
/// Accounts are created by the clinic admin, so every nurse starts with a
/// password that at least one other person knows and that is often written down
/// somewhere in the ward. The endpoint has existed all along; the phone simply
/// had no way to reach it, which meant in practice nobody ever changed one.
class ChangePasswordScreen extends StatefulWidget {
  const ChangePasswordScreen({super.key, required this.api});

  final ApiClient api;

  @override
  State<ChangePasswordScreen> createState() => _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends State<ChangePasswordScreen> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _repeat = TextEditingController();
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  /// Short, and checked here as well as on the server so the nurse is told
  /// before the round trip rather than after it.
  static const _minLength = 8;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _repeat.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy) return;
    final next = _next.text;

    if (next.length < _minLength) {
      setState(
        () => _error =
            'Yangi parol kamida $_minLength ta belgidan iborat bo‘lsin',
      );
      return;
    }
    if (next != _repeat.text) {
      setState(() => _error = 'Yangi parollar bir xil emas');
      return;
    }
    if (next == _current.text) {
      setState(() => _error = 'Yangi parol eskisidan farq qilsin');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.api.changePassword(current: _current.text, next: next);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      setState(
        () => _error = e.isUnauthorized || e.status == 400
            ? 'Joriy parol noto‘g‘ri'
            : e.message,
      );
    } catch (_) {
      setState(() => _error = 'Serverga ulanib bo‘lmadi');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
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
          'Parolni o‘zgartirish',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 22, 20, 28),
              children: [
                Text(
                  'Yangi parolni faqat o‘zingiz bilasiz. Uni yozib qo‘ymang va '
                  'boshqa hamshiraga aytmang — chaqiruvni kim qabul qilgani '
                  'sizning nomingiz bilan yoziladi.',
                  style: TextStyle(color: p.text3, fontSize: 13.5, height: 1.5),
                ),
                const SizedBox(height: 22),
                _field(p, _current, 'Joriy parol', Icons.lock_outline),
                const SizedBox(height: 12),
                _field(p, _next, 'Yangi parol', Icons.lock_reset),
                const SizedBox(height: 12),
                _field(
                  p,
                  _repeat,
                  'Yangi parolni takrorlang',
                  Icons.check_circle_outline,
                  onSubmitted: (_) => _submit(),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 14),
                  Text(
                    _error!,
                    style: TextStyle(color: p.dangerInk, fontSize: 13.5),
                  ),
                ],
                const SizedBox(height: 24),
                SizedBox(
                  height: 52,
                  child: FilledButton(
                    onPressed: _busy ? null : _submit,
                    style: FilledButton.styleFrom(
                      backgroundColor: p.accent,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(13),
                      ),
                    ),
                    child: _busy
                        ? const SizedBox(
                            width: 21,
                            height: 21,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.4,
                              valueColor: AlwaysStoppedAnimation(Colors.white),
                            ),
                          )
                        : const Text(
                            'Saqlash',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _field(
    Palette p,
    TextEditingController controller,
    String hint,
    IconData icon, {
    ValueChanged<String>? onSubmitted,
  }) => TextField(
    controller: controller,
    obscureText: _obscure,
    onSubmitted: onSubmitted,
    textInputAction: onSubmitted != null
        ? TextInputAction.done
        : TextInputAction.next,
    style: TextStyle(color: p.text1, fontSize: 16),
    decoration: InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(color: p.text3),
      prefixIcon: Icon(icon, color: p.text3, size: 20),
      // One control for all three fields: a nurse checking what she typed wants
      // to see every box, and three separate eyes is three times the fiddling.
      //
      // ExcludeFocus: without it, moving to the next field lands on this eye
      // button instead, and the password typed next goes into the field the
      // nurse just left. Found by driving the real form in a browser.
      suffixIcon: ExcludeFocus(
        child: IconButton(
          onPressed: () => setState(() => _obscure = !_obscure),
          icon: Icon(
            _obscure ? Icons.visibility_off : Icons.visibility,
            color: p.text3,
            size: 20,
          ),
        ),
      ),
      filled: true,
      fillColor: p.card,
      contentPadding: const EdgeInsets.symmetric(vertical: 16),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(13),
        borderSide: BorderSide(color: p.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(13),
        borderSide: BorderSide(color: p.accent, width: 1.6),
      ),
    ),
  );
}
