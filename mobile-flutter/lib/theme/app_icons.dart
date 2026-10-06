import 'package:flutter/material.dart';

/// High-resolution official brand logo using the provided asset,
/// with vector fallback for maximum clarity and responsiveness.
class AppLogo extends StatelessWidget {
  const AppLogo({
    super.key,
    this.size = 28,
    this.withGlow = false,
  });

  final double size;
  final bool withGlow;

  @override
  Widget build(BuildContext context) {
    Widget image = Image.asset(
      'assets/images/logo.png',
      width: size,
      height: size,
      fit: BoxFit.contain,
      filterQuality: FilterQuality.high,
      errorBuilder: (context, error, stackTrace) => NurseCallLogo(
        size: size,
        withContainer: false,
      ),
    );

    if (withGlow) {
      return Container(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF00E5FF).withValues(alpha: 0.35),
              blurRadius: size * 0.45,
              spreadRadius: 2,
            ),
          ],
        ),
        child: image,
      );
    }
    return image;
  }
}

/// Pixel-perfect vector logo and iconography identical to the Web Dashboard SVG.
class NurseCallLogo extends StatelessWidget {
  const NurseCallLogo({
    super.key,
    this.size = 28,
    this.color,
    this.withContainer = true,
  });

  final double size;
  final Color? color;
  final bool withContainer;

  @override
  Widget build(BuildContext context) {
    final themeColor = color ?? Theme.of(context).colorScheme.primary;
    return CustomPaint(
      size: Size(size, size),
      painter: _NurseCallLogoPainter(
        color: themeColor,
        withContainer: withContainer,
      ),
    );
  }
}

class _NurseCallLogoPainter extends CustomPainter {
  const _NurseCallLogoPainter({
    required this.color,
    required this.withContainer,
  });

  final Color color;
  final bool withContainer;

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 24.0;
    canvas.save();
    canvas.scale(scale, scale);

    // 1. Container rounded rect
    if (withContainer) {
      final bgPaint = Paint()
        ..color = color.withValues(alpha: 0.14)
        ..style = PaintingStyle.fill;
      final rrect = RRect.fromRectAndRadius(
        const Rect.fromLTWH(0, 0, 24, 24),
        const Radius.circular(6),
      );
      canvas.drawRRect(rrect, bgPaint);
    }

    // 2. Medical Cross in background: d="M10 5h4v4h4v4h-4v4h-4v-4H6V9h4V5z"
    final crossPath = Path()
      ..moveTo(10, 5)
      ..lineTo(14, 5)
      ..lineTo(14, 9)
      ..lineTo(18, 9)
      ..lineTo(18, 13)
      ..lineTo(14, 13)
      ..lineTo(14, 17)
      ..lineTo(10, 17)
      ..lineTo(10, 13)
      ..lineTo(6, 13)
      ..lineTo(6, 9)
      ..lineTo(10, 9)
      ..close();

    final crossPaint = Paint()
      ..color = color.withValues(alpha: 0.28)
      ..style = PaintingStyle.fill;
    canvas.drawPath(crossPath, crossPaint);

    // 3. ECG / Cardiogram pulse wave: d="M4 12.5h3.5l1.5-4 2.5 8 2-5 1.5 1h5"
    final ecgPath = Path()
      ..moveTo(4, 12.5)
      ..lineTo(7.5, 12.5)
      ..lineTo(9.0, 8.5)
      ..lineTo(11.5, 16.5)
      ..lineTo(13.5, 11.5)
      ..lineTo(15.0, 12.5)
      ..lineTo(20.0, 12.5);

    final ecgPaint = Paint()
      ..color = color
      ..strokeWidth = 1.9
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    canvas.drawPath(ecgPath, ecgPaint);

    // 4. Pulse dot: cx="15", cy="12.5", r="1.2"
    final dotPaint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
    canvas.drawCircle(const Offset(15, 12.5), 1.3, dotPaint);

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _NurseCallLogoPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.withContainer != withContainer;
}
