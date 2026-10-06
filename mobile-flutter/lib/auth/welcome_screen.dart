import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_icons.dart';
import '../theme/tokens.dart';
import 'login_screen.dart';
import 'session_store.dart';

class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key, required this.sessions});

  final SessionStore sessions;

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen>
    with TickerProviderStateMixin {
  late final PageController _pageController;
  late final AnimationController _entryController;
  late final AnimationController _heartbeatController;

  // Staggered entrance animations
  late final Animation<double> _headerFade;
  late final Animation<Offset> _headerSlide;
  late final Animation<double> _cardsFade;
  late final Animation<Offset> _cardsSlide;
  late final Animation<double> _buttonsFade;
  late final Animation<Offset> _buttonsSlide;

  // Realistic medical heartbeat pulse on logo
  late final Animation<double> _heartbeatScale;

  int _currentPage = 0;

  final List<_FeatureItem> _features = const [
    _FeatureItem(
      icon: Icons.notifications_active_outlined,
      title: '1 Soniyada Bilakda Tebranish',
      description:
          'Bemor palatadagi tugmani bosishi bilan hamshira smart-soati va telefonida chaqiruv darhol aks etadi.',
      badgeText: '0.4s Ultra Tezkor',
      color: T.sky400,
      imageAsset: 'assets/images/smartwatch_call.jpg',
    ),
    _FeatureItem(
      icon: Icons.meeting_room_outlined,
      title: '0 Ta Yo‘qotilgan Chaqiruv',
      description:
          'Har bir palata, koyka va dush xonalari holati markaziy tizim va ekranda to‘liq nazoratda bo‘ladi.',
      badgeText: '100% Nazorat',
      color: T.emerald400,
      imageAsset: 'assets/images/hospital_room.jpg',
    ),
    _FeatureItem(
      icon: Icons.timer_outlined,
      title: 'Tezkor Reaksiya va Statistika',
      description:
          'Hamshira yetib borish vaqti va xizmat sifati bo‘yicha aniq tahliliy hisobotlar yuritiladi.',
      badgeText: 'Sekundomer',
      color: T.amber400,
      imageAsset: 'assets/images/nurse_staff.jpg',
    ),
  ];

  @override
  void initState() {
    super.initState();
    _pageController = PageController(viewportFraction: 0.92);

    // 1. Staggered Entrance Controller (runs once on launch)
    _entryController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );

    _headerFade = CurvedAnimation(
      parent: _entryController,
      curve: const Interval(0.0, 0.45, curve: Curves.easeOut),
    );
    _headerSlide = Tween<Offset>(
      begin: const Offset(0, -0.08),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _entryController,
      curve: const Interval(0.0, 0.45, curve: Curves.easeOutCubic),
    ));

    _cardsFade = CurvedAnimation(
      parent: _entryController,
      curve: const Interval(0.20, 0.70, curve: Curves.easeOut),
    );
    _cardsSlide = Tween<Offset>(
      begin: const Offset(0, 0.06),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _entryController,
      curve: const Interval(0.20, 0.70, curve: Curves.easeOutCubic),
    ));

    _buttonsFade = CurvedAnimation(
      parent: _entryController,
      curve: const Interval(0.45, 1.0, curve: Curves.easeOut),
    );
    _buttonsSlide = Tween<Offset>(
      begin: const Offset(0, 0.10),
      end: Offset.zero,
    ).animate(CurvedAnimation(
      parent: _entryController,
      curve: const Interval(0.45, 1.0, curve: Curves.easeOutCubic),
    ));

    // 2. Medical ECG Heartbeat Rhythm (Systole + Diastole + Rest)
    _heartbeatController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    );

    _heartbeatScale = TweenSequence<double>([
      // Beat 1 (Systole)
      TweenSequenceItem(
        tween: Tween<double>(begin: 1.0, end: 1.08)
            .chain(CurveTween(curve: Curves.easeOutQuad)),
        weight: 10,
      ),
      TweenSequenceItem(
        tween: Tween<double>(begin: 1.08, end: 0.98)
            .chain(CurveTween(curve: Curves.easeInQuad)),
        weight: 10,
      ),
      // Beat 2 (Diastole)
      TweenSequenceItem(
        tween: Tween<double>(begin: 0.98, end: 1.04)
            .chain(CurveTween(curve: Curves.easeOutQuad)),
        weight: 10,
      ),
      TweenSequenceItem(
        tween: Tween<double>(begin: 1.04, end: 1.0)
            .chain(CurveTween(curve: Curves.easeInQuad)),
        weight: 12,
      ),
      // Resting phase
      TweenSequenceItem(
        tween: ConstantTween<double>(1.0),
        weight: 58,
      ),
    ]).animate(_heartbeatController);

    _entryController.forward();
    _heartbeatController.repeat();
  }

  @override
  void dispose() {
    _entryController.dispose();
    _heartbeatController.dispose();
    _pageController.dispose();
    super.dispose();
  }

  void _startGuestDemo() {
    HapticFeedback.mediumImpact();
    widget.sessions.startGuestDemo();
  }

  void _openLogin() {
    HapticFeedback.lightImpact();
    Navigator.of(context).push(
      PageRouteBuilder(
        pageBuilder: (context, animation, secondaryAnimation) =>
            LoginScreen(sessions: widget.sessions),
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          return FadeTransition(
            opacity: CurvedAnimation(
              parent: animation,
              curve: Curves.easeOut,
            ),
            child: SlideTransition(
              position: Tween<Offset>(
                begin: const Offset(0, 0.05),
                end: Offset.zero,
              ).animate(CurvedAnimation(
                parent: animation,
                curve: Curves.easeOutCubic,
              )),
              child: child,
            ),
          );
        },
        transitionDuration: const Duration(milliseconds: 280),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF090E17) : p.page,
      body: SafeArea(
        top: true,
        bottom: true,
        minimum: const EdgeInsets.only(bottom: 14),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 6),

              // 1. Staggered Header with Heartbeat-animated Logo
              FadeTransition(
                opacity: _headerFade,
                child: SlideTransition(
                  position: _headerSlide,
                  child: Center(
                    child: Column(
                      children: [
                        ScaleTransition(
                          scale: _heartbeatScale,
                          child: Container(
                            width: 66,
                            height: 66,
                            padding: const EdgeInsets.all(11),
                            decoration: BoxDecoration(
                              color: isDark
                                  ? const Color(0xFF131D2F)
                                  : Colors.white,
                              borderRadius: BorderRadius.circular(18),
                              border: Border.all(
                                color: isDark
                                    ? Colors.white.withValues(alpha: 0.14)
                                    : p.border,
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: const Color(0xFF00E5FF).withValues(
                                    alpha: isDark ? 0.22 : 0.10,
                                  ),
                                  blurRadius: 20,
                                  offset: const Offset(0, 4),
                                ),
                              ],
                            ),
                            child: const Center(
                              child: AppLogo(
                                size: 44,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'NurseCall',
                          style: TextStyle(
                            color: isDark ? const Color(0xFFDEE2F0) : p.text1,
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.4,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          'Tibbiy Shoshilinch Chaqiruv Tizimi',
                          style: TextStyle(
                            color: isDark ? const Color(0xFF94A3B8) : p.text3,
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 18),

              // 2. Feature Carousel with Parallax / Scale Interactivity
              Expanded(
                child: FadeTransition(
                  opacity: _cardsFade,
                  child: SlideTransition(
                    position: _cardsSlide,
                    child: PageView.builder(
                      controller: _pageController,
                      onPageChanged: (idx) =>
                          setState(() => _currentPage = idx),
                      itemCount: _features.length,
                      itemBuilder: (context, idx) {
                        return AnimatedBuilder(
                          animation: _pageController,
                          builder: (context, child) {
                            double scale = 1.0;
                            double opacity = 1.0;
                            if (_pageController.position.haveDimensions) {
                              final page = _pageController.page ?? 0.0;
                              final dist = (page - idx).abs();
                              scale = (1.0 - (dist * 0.08)).clamp(0.90, 1.0);
                              opacity = (1.0 - (dist * 0.35)).clamp(0.65, 1.0);
                            }
                            return Transform.scale(
                              scale: scale,
                              child: Opacity(
                                opacity: opacity,
                                child: child,
                              ),
                            );
                          },
                          child: _buildCard(p, isDark, _features[idx]),
                        );
                      },
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 12),

              // 3. Smooth Morphing Indicator Dots
              FadeTransition(
                opacity: _buttonsFade,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(
                    _features.length,
                    (idx) => AnimatedContainer(
                      duration: const Duration(milliseconds: 250),
                      curve: Curves.easeOutCubic,
                      margin: const EdgeInsets.symmetric(horizontal: 3.5),
                      width: _currentPage == idx ? 22 : 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: _currentPage == idx
                            ? const Color(0xFF00E5FF)
                            : (isDark
                                ? Colors.white.withValues(alpha: 0.18)
                                : p.text3.withValues(alpha: 0.3)),
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 18),

              // 4. Interactive Tactile CTA Buttons
              FadeTransition(
                opacity: _buttonsFade,
                child: SlideTransition(
                  position: _buttonsSlide,
                  child: Column(
                    children: [
                      // Primary CTA: Guest Demo
                      _PressableButton(
                        onTap: _startGuestDemo,
                        child: Container(
                          height: 52,
                          decoration: BoxDecoration(
                            color: const Color(0xFF00E5FF),
                            borderRadius: BorderRadius.circular(15),
                            boxShadow: [
                              BoxShadow(
                                color: const Color(0xFF00E5FF)
                                    .withValues(alpha: 0.30),
                                blurRadius: 14,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: const Center(
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  Icons.play_arrow_rounded,
                                  size: 22,
                                  color: Color(0xFF090E17),
                                ),
                                SizedBox(width: 8),
                                Text(
                                  'Boshlash (Loginsiz Sinash)',
                                  style: TextStyle(
                                    color: Color(0xFF090E17),
                                    fontSize: 15.5,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),

                      const SizedBox(height: 10),

                      // Secondary CTA: Login
                      _PressableButton(
                        onTap: _openLogin,
                        child: Container(
                          height: 50,
                          decoration: BoxDecoration(
                            color: isDark
                                ? Colors.white.withValues(alpha: 0.04)
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(15),
                            border: Border.all(
                              color: isDark
                                  ? Colors.white.withValues(alpha: 0.14)
                                  : p.border,
                            ),
                          ),
                          child: Center(
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  Icons.login_rounded,
                                  size: 19,
                                  color: isDark
                                      ? const Color(0xFFDEE2F0)
                                      : p.text1,
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  'Klinika Hisobiga Kirish',
                                  style: TextStyle(
                                    color: isDark
                                        ? const Color(0xFFDEE2F0)
                                        : p.text1,
                                    fontSize: 14.5,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 6),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCard(Palette p, bool isDark, _FeatureItem item) {
    if (item.imageAsset != null) {
      return Container(
        margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        decoration: BoxDecoration(
          color: isDark
              ? const Color(0xFF131D2F).withValues(alpha: 0.95)
              : p.card,
          borderRadius: BorderRadius.circular(22),
          border: Border.all(
            color: isDark
                ? Colors.white.withValues(alpha: 0.12)
                : p.border,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: isDark ? 0.35 : 0.06),
              blurRadius: 18,
              offset: const Offset(0, 5),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Responsive Hospital Room Image Showcase
            Expanded(
              flex: 11,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.asset(
                    item.imageAsset!,
                    fit: BoxFit.cover,
                    filterQuality: FilterQuality.high,
                  ),
                  // Smooth gradient fade at bottom of image
                  DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          isDark
                              ? const Color(0xFF131D2F)
                              : Colors.white,
                        ],
                        stops: const [0.45, 1.0],
                      ),
                    ),
                  ),
                  // Floating badge over image
                  Positioned(
                    top: 12,
                    left: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4.5,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.72),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: const Color(0xFF00E5FF).withValues(alpha: 0.60),
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF00E5FF).withValues(alpha: 0.20),
                            blurRadius: 8,
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 6.5,
                            height: 6.5,
                            decoration: const BoxDecoration(
                              color: Color(0xFF00E5FF),
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 5.5),
                          Text(
                            item.badgeText,
                            style: const TextStyle(
                              color: Color(0xFF00E5FF),
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            // Text info container
            Expanded(
              flex: 8,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      item.title,
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: isDark ? const Color(0xFFDEE2F0) : p.text1,
                        fontSize: 16.5,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.2,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      item.description,
                      textAlign: TextAlign.center,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: isDark ? const Color(0xFF94A3B8) : p.text2,
                        fontSize: 12.5,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: isDark
            ? const Color(0xFF131D2F).withValues(alpha: 0.90)
            : p.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.09)
              : p.border,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.30 : 0.04),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Center(
        child: SingleChildScrollView(
          physics: const BouncingScrollPhysics(),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color: item.color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: item.color.withValues(alpha: 0.30),
                  ),
                ),
                child: Text(
                  item.badgeText,
                  style: TextStyle(
                    color: item.color,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: item.color.withValues(alpha: 0.10),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  item.icon,
                  size: 28,
                  color: item.color,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                item.title,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: isDark ? const Color(0xFFDEE2F0) : p.text1,
                  fontSize: 17.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.2,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                item.description,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: isDark ? const Color(0xFF94A3B8) : p.text2,
                  fontSize: 13,
                  height: 1.4,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Spring-physics interactive button with tactile scale feedback on tap
class _PressableButton extends StatefulWidget {
  const _PressableButton({required this.onTap, required this.child});

  final VoidCallback onTap;
  final Widget child;

  @override
  State<_PressableButton> createState() => _PressableButtonState();
}

class _PressableButtonState extends State<_PressableButton> {
  bool _pressed = false;
  
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) {
        setState(() => _pressed = false);
        widget.onTap();
      },
      onTapCancel: () => setState(() => _pressed = false),
      behavior: HitTestBehavior.opaque,
      child: AnimatedScale(
        scale: _pressed ? 0.965 : 1.0,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOutCubic,
        child: widget.child,
      ),
    );
  }
}

class _FeatureItem {
  const _FeatureItem({
    required this.icon,
    required this.title,
    required this.description,
    required this.badgeText,
    required this.color,
    this.imageAsset,
  });

  final IconData icon;
  final String title;
  final String description;
  final String badgeText;
  final Color color;
  final String? imageAsset;
}
