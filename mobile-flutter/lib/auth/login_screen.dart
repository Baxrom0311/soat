import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../theme/tokens.dart';
import 'session_store.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.sessions});

  final SessionStore sessions;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    HapticFeedback.lightImpact();
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.sessions.signIn(_email.text, _password.text);
      // No navigation here: the root listens to the session store and swaps the
      // screen. One place decides what is on screen, so the two cannot disagree.
    } on ApiException catch (e) {
      setState(
        () => _error = e.isUnauthorized
            ? 'Email yoki parol noto‘g‘ri'
            : e.message,
      );
    } catch (_) {
      setState(
        () => _error = 'Serverga ulanib bo‘lmadi. Internetni tekshiring.',
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    return Scaffold(
      backgroundColor: p.page,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Icon(Icons.notifications_active, size: 52, color: p.accent),
                const SizedBox(height: 18),
                Text(
                  'NurseCall',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: p.text1,
                    fontSize: 30,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Hamshira uchun',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: p.text3, fontSize: 14),
                ),
                const SizedBox(height: 34),
                _field(
                  p: p,
                  controller: _email,
                  hint: 'Email',
                  icon: Icons.alternate_email,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.username],
                ),
                const SizedBox(height: 12),
                _field(
                  p: p,
                  controller: _password,
                  hint: 'Parol',
                  icon: Icons.lock_outline,
                  obscure: _obscure,
                  autofillHints: const [AutofillHints.password],
                  onSubmitted: (_) => _submit(),
                  // ExcludeFocus: keyboard traversal must go email -> password,
                  // never email -> eye -> password, or what the nurse types next
                  // lands in the box she just left.
                  suffix: ExcludeFocus(
                    child: IconButton(
                      onPressed: () => setState(() => _obscure = !_obscure),
                      icon: Icon(
                        _obscure ? Icons.visibility_off : Icons.visibility,
                        color: p.text3,
                        size: 20,
                      ),
                    ),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 14),
                  Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: T.red600, fontSize: 13.5),
                  ),
                ],
                const SizedBox(height: 22),
                SizedBox(
                  height: 54,
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
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.4,
                              valueColor: AlwaysStoppedAnimation(Colors.white),
                            ),
                          )
                        : const Text(
                            'Kirish',
                            style: TextStyle(
                              fontSize: 17,
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

  Widget _field({
    required TextEditingController controller,
    required Palette p,
    required String hint,
    required IconData icon,
    bool obscure = false,
    TextInputType? keyboardType,
    Iterable<String>? autofillHints,
    Widget? suffix,
    ValueChanged<String>? onSubmitted,
  }) => TextField(
    controller: controller,
    obscureText: obscure,
    keyboardType: keyboardType,
    autofillHints: autofillHints,
    onSubmitted: onSubmitted,
    textInputAction: onSubmitted != null
        ? TextInputAction.done
        : TextInputAction.next,
    style: TextStyle(color: p.text1, fontSize: 16),
    decoration: InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(color: p.text3),
      prefixIcon: Icon(icon, color: p.text3, size: 20),
      suffixIcon: suffix,
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
