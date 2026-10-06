import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../theme/app_icons.dart';
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
  bool _rememberMe = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  void _fillSavedAccount(SavedAccount acc) {
    HapticFeedback.selectionClick();
    _email.text = acc.email;
    if (acc.savedPassword != null) {
      _password.text = acc.savedPassword!;
    }
    setState(() => _error = null);
  }

  Future<void> _submit() async {
    HapticFeedback.lightImpact();
    if (_busy) return;
    final email = _email.text.trim();
    final password = _password.text;

    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = 'Email va parolni kiriting');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await widget.sessions.signIn(email, password, remember: _rememberMe);
      if (mounted && Navigator.canPop(context)) {
        Navigator.pop(context);
      }
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

  void _fillPreset(String email, String password) {
    HapticFeedback.selectionClick();
    _email.text = email;
    _password.text = password;
    setState(() => _error = null);
  }

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final canPop = Navigator.canPop(context);

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF090E17) : p.page,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: canPop
            ? IconButton(
                icon: Icon(
                  Icons.arrow_back_rounded,
                  color: isDark ? const Color(0xFFDEE2F0) : p.text1,
                ),
                onPressed: () => Navigator.pop(context),
              )
            : null,
      ),
      body: Stack(
        children: [
          // Background ambient lights
          Positioned(
            top: -40,
            right: -30,
            child: Container(
              width: 240,
              height: 240,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    const Color(0xFF00E5FF).withValues(alpha: isDark ? 0.12 : 0.06),
                    Colors.transparent,
                  ],
                ),
              ),
            ),
          ),

          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Clinical Logo Beacon
                    Center(
                      child: Container(
                        width: 64,
                        height: 64,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: isDark
                              ? const Color(0xFF131D2F)
                              : Colors.white,
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(
                            color: isDark
                                ? Colors.white.withValues(alpha: 0.12)
                                : p.border,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: isDark ? 0.35 : 0.06),
                              blurRadius: 18,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        child: const Center(
                          child: AppLogo(
                            size: 40,
                          ),
                        ),
                      ),
                    ),

                    const SizedBox(height: 18),

                    Text(
                      'Klinika Tizimiga Kirish',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: isDark ? const Color(0xFFDEE2F0) : p.text1,
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Klinikangiz bergan rasmiy hisob ma’lumotlarini kiriting',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: isDark ? const Color(0xFF94A3B8) : p.text3,
                        fontSize: 13.5,
                      ),
                    ),

                    const SizedBox(height: 28),

                    // Saved Accounts Section
                    if (widget.sessions.savedAccounts.isNotEmpty) ...[
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Saqlangan hisoblar:',
                                style: TextStyle(
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700,
                                  color: isDark
                                      ? const Color(0xFFDEE2F0)
                                      : p.text1,
                                ),
                              ),
                              Text(
                                'Bir bosishda kirish',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: isDark
                                      ? const Color(0xFF94A3B8)
                                      : p.text3,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          SizedBox(
                            height: 52,
                            child: ListView.separated(
                              scrollDirection: Axis.horizontal,
                              itemCount: widget.sessions.savedAccounts.length,
                              separatorBuilder: (context, index) =>
                                  const SizedBox(width: 8),
                              itemBuilder: (context, idx) {
                                final acc = widget.sessions.savedAccounts[idx];
                                final isSelected =
                                    _email.text.trim().toLowerCase() ==
                                    acc.email.toLowerCase();
                                return _savedAccountCard(
                                  acc,
                                  isSelected: isSelected,
                                  isDark: isDark,
                                  p: p,
                                );
                              },
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],
                      ),
                    ],

                    // Card container for inputs
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: isDark
                            ? const Color(0xFF131D2F).withValues(alpha: 0.8)
                            : p.card,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: isDark
                              ? Colors.white.withValues(alpha: 0.08)
                              : p.border,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _field(
                            isDark: isDark,
                            p: p,
                            controller: _email,
                            hint: 'nurse@clinic.uz',
                            label: 'Elektron pochta',
                            icon: Icons.alternate_email_rounded,
                            keyboardType: TextInputType.emailAddress,
                            autofillHints: const [AutofillHints.username],
                          ),
                          const SizedBox(height: 16),
                          _field(
                            isDark: isDark,
                            p: p,
                            controller: _password,
                            hint: '••••••••',
                            label: 'Maxfiy parol',
                            icon: Icons.lock_outline_rounded,
                            obscure: _obscure,
                            autofillHints: const [AutofillHints.password],
                            onSubmitted: (_) => _submit(),
                            suffix: ExcludeFocus(
                              child: IconButton(
                                onPressed: () =>
                                    setState(() => _obscure = !_obscure),
                                icon: Icon(
                                  _obscure
                                      ? Icons.visibility_off_rounded
                                      : Icons.visibility_rounded,
                                  color: isDark
                                      ? const Color(0xFF94A3B8)
                                      : p.text3,
                                  size: 20,
                                ),
                              ),
                            ),
                          ),

                          const SizedBox(height: 12),

                          // Remember credentials checkbox
                          Row(
                            children: [
                              SizedBox(
                                height: 22,
                                width: 22,
                                child: Checkbox(
                                  value: _rememberMe,
                                  activeColor: const Color(0xFF00E5FF),
                                  checkColor: const Color(0xFF090E17),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(5),
                                  ),
                                  onChanged: (v) =>
                                      setState(() => _rememberMe = v ?? true),
                                ),
                              ),
                              const SizedBox(width: 8),
                              GestureDetector(
                                onTap: () =>
                                    setState(() => _rememberMe = !_rememberMe),
                                child: Text(
                                  'Hisobni eslab qolish',
                                  style: TextStyle(
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.w600,
                                    color: isDark
                                        ? const Color(0xFFDEE2F0)
                                        : p.text1,
                                  ),
                                ),
                              ),
                            ],
                          ),

                          const SizedBox(height: 12),

                          // Quick Preset chips
                          Row(
                            children: [
                              Text(
                                'Tezkor sinash:',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: isDark
                                      ? const Color(0xFF94A3B8)
                                      : p.text3,
                                ),
                              ),
                              const SizedBox(width: 8),
                              _presetChip(
                                label: 'Hamshira',
                                icon: Icons.person_rounded,
                                isDark: isDark,
                                p: p,
                                onTap: () => _fillPreset(
                                  'nurse@example.com',
                                  'nurse123',
                                ),
                              ),
                              const SizedBox(width: 6),
                              _presetChip(
                                label: 'Admin',
                                icon: Icons.admin_panel_settings_rounded,
                                isDark: isDark,
                                p: p,
                                onTap: () => _fillPreset(
                                  'admin@example.com',
                                  'admin123',
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),

                    if (_error != null) ...[
                      const SizedBox(height: 14),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          color: T.red500.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: T.red500.withValues(alpha: 0.35),
                          ),
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.error_outline_rounded,
                              color: T.red500,
                              size: 18,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _error!,
                                style: const TextStyle(
                                  color: T.red500,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],

                    const SizedBox(height: 24),

                    // Primary Submit Button with Cyan-Cobalt Glow
                    Container(
                      height: 52,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(15),
                        gradient: const LinearGradient(
                          colors: [Color(0xFF00E5FF), Color(0xFF0A6AFA)],
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF00E5FF).withValues(alpha: 0.35),
                            blurRadius: 18,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Material(
                        color: Colors.transparent,
                        child: InkWell(
                          onTap: _busy ? null : _submit,
                          borderRadius: BorderRadius.circular(15),
                          child: Center(
                            child: _busy
                                ? const SizedBox(
                                    width: 22,
                                    height: 22,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.4,
                                      valueColor: AlwaysStoppedAnimation(
                                        Color(0xFF090E17),
                                      ),
                                    ),
                                  )
                                : const Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(
                                        Icons.login_rounded,
                                        size: 20,
                                        color: Color(0xFF090E17),
                                      ),
                                      SizedBox(width: 8),
                                      Text(
                                        'Tizimga Kirish',
                                        style: TextStyle(
                                          color: Color(0xFF090E17),
                                          fontSize: 16,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                    ],
                                  ),
                          ),
                        ),
                      ),
                    ),

                    const SizedBox(height: 20),

                    // Guest Demo link
                    Center(
                      child: TextButton.icon(
                        onPressed: () {
                          HapticFeedback.mediumImpact();
                          widget.sessions.startGuestDemo();
                          if (mounted && Navigator.canPop(context)) {
                            Navigator.pop(context);
                          }
                        },
                        icon: const Icon(
                          Icons.play_circle_outline_rounded,
                          size: 18,
                          color: Color(0xFF00E5FF),
                        ),
                        label: const Text(
                          'Loginsiz Sinash (Guest Demo)',
                          style: TextStyle(
                            color: Color(0xFF00E5FF),
                            fontSize: 14,
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
        ],
      ),
    );
  }

  Widget _presetChip({
    required String label,
    required IconData icon,
    required bool isDark,
    required Palette p,
    required VoidCallback onTap,
  }) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: isDark ? Colors.white.withValues(alpha: 0.08) : p.page,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isDark ? Colors.white.withValues(alpha: 0.12) : p.border,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 13,
            color: isDark ? const Color(0xFF00E5FF) : p.accent,
          ),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: isDark ? const Color(0xFFDEE2F0) : p.text1,
            ),
          ),
        ],
      ),
    ),
  );

  Widget _field({
    required bool isDark,
    required Palette p,
    required TextEditingController controller,
    required String hint,
    required String label,
    required IconData icon,
    bool obscure = false,
    TextInputType? keyboardType,
    Iterable<String>? autofillHints,
    Widget? suffix,
    ValueChanged<String>? onSubmitted,
  }) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        label,
        style: TextStyle(
          color: isDark ? const Color(0xFF94A3B8) : p.text2,
          fontSize: 12.5,
          fontWeight: FontWeight.w600,
        ),
      ),
      const SizedBox(height: 6),
      TextField(
        controller: controller,
        obscureText: obscure,
        keyboardType: keyboardType,
        autofillHints: autofillHints,
        onSubmitted: onSubmitted,
        textInputAction: onSubmitted != null
            ? TextInputAction.done
            : TextInputAction.next,
        style: TextStyle(
          color: isDark ? const Color(0xFFDEE2F0) : p.text1,
          fontSize: 15.5,
        ),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: TextStyle(
            color: isDark ? const Color(0xFF64748B) : p.text3,
            fontSize: 14,
          ),
          prefixIcon: Icon(
            icon,
            color: isDark ? const Color(0xFF64748B) : p.text3,
            size: 20,
          ),
          suffixIcon: suffix,
          filled: true,
          fillColor: isDark ? const Color(0xFF0E1526) : p.page,
          contentPadding: const EdgeInsets.symmetric(
            vertical: 14,
            horizontal: 14,
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(
              color: isDark ? Colors.white.withValues(alpha: 0.08) : p.border,
            ),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFF00E5FF), width: 1.6),
          ),
        ),
      ),
    ],
  );

  Widget _savedAccountCard(
    SavedAccount acc, {
    required bool isSelected,
    required bool isDark,
    required Palette p,
  }) {
    return GestureDetector(
      onTap: () => _fillSavedAccount(acc),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? (isDark
                  ? const Color(0xFF1E2D4A)
                  : T.sky500.withValues(alpha: 0.15))
              : (isDark ? const Color(0xFF131D2F) : p.card),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected
                ? const Color(0xFF00E5FF)
                : (isDark ? Colors.white.withValues(alpha: 0.10) : p.border),
            width: isSelected ? 1.6 : 1,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFF00E5FF), width: 1.5),
              ),
              child: ClipOval(
                child: Image.asset(
                  'assets/images/nurse_pic.png',
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) => Container(
                    color: T.sky500.withValues(alpha: 0.20),
                    alignment: Alignment.center,
                    child: Text(
                      acc.name.isNotEmpty ? acc.name[0].toUpperCase() : 'H',
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF00E5FF),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  acc.name.isNotEmpty ? acc.name : 'Hamshira',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: isDark ? const Color(0xFFDEE2F0) : p.text1,
                  ),
                ),
                Text(
                  acc.email,
                  style: TextStyle(
                    fontSize: 10,
                    color: isDark ? const Color(0xFF94A3B8) : p.text3,
                  ),
                ),
              ],
            ),
            const SizedBox(width: 6),
            GestureDetector(
              onTap: () {
                HapticFeedback.lightImpact();
                widget.sessions.removeSavedAccount(acc.email);
                setState(() {});
              },
              behavior: HitTestBehavior.opaque,
              child: Padding(
                padding: const EdgeInsets.all(4),
                child: Icon(
                  Icons.close_rounded,
                  size: 14,
                  color: isDark ? const Color(0xFF64748B) : p.text3,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
