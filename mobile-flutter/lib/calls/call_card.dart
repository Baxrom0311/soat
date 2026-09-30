import 'package:flutter/material.dart';

import '../api/models.dart';
import '../core/age.dart';
import '../theme/tokens.dart';

/// One waiting patient.
///
/// The room number is the largest thing on screen by a wide margin, because it
/// is the only thing the nurse has to carry with her when she looks up and
/// starts walking. Everything else on the card is context for that one number.
class CallCard extends StatelessWidget {
  const CallCard({
    super.key,
    required this.call,
    required this.now,
    required this.onAcknowledge,
    this.busy = false,
  });

  final Call call;
  final DateTime now;

  /// Nullable would be wrong here: a card a nurse cannot answer has no business
  /// on this screen. The wall display, which genuinely only shows, is a
  /// different surface with a different widget.
  final Future<void> Function() onAcknowledge;

  final bool busy;

  @override
  Widget build(BuildContext context) {
    final waited = call.waited(now);
    final step = ageStep(waited);
    final accent = T.forStep(step);
    final ink = T.inkOnStep(step);

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: T.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: accent.withValues(alpha: 0.55), width: 1.5),
      ),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Flexible(
                child: Text(
                  call.roomNumber,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: accent,
                    fontSize: 46,
                    height: 1.0,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -1,
                    // Tabular figures so the number does not shuffle sideways as
                    // digits change on a ward with rooms 9 and 118 in the list.
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
              ),
              const SizedBox(width: 10),
              _Chip(text: '${call.floor}-qavat', color: accent),
              const Spacer(),
              _Elapsed(waited: waited, color: accent),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 52,
            child: FilledButton(
              onPressed: busy ? null : () => onAcknowledge(),
              style: FilledButton.styleFrom(
                backgroundColor: accent,
                foregroundColor: ink,
                disabledBackgroundColor: accent.withValues(alpha: 0.4),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: busy
                  ? SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        valueColor: AlwaysStoppedAnimation(ink),
                      ),
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.check_circle_outline, size: 20, color: ink),
                        const SizedBox(width: 8),
                        Text(
                          'Qabul qilish',
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            color: ink,
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
}

class _Chip extends StatelessWidget {
  const _Chip({required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.16),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          text,
          style: TextStyle(
            color: color,
            fontSize: 12.5,
            fontWeight: FontWeight.w700,
          ),
        ),
      );
}

class _Elapsed extends StatelessWidget {
  const _Elapsed({required this.waited, required this.color});

  final Duration waited;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.schedule, size: 15, color: color),
            const SizedBox(width: 6),
            Text(
              elapsedLabel(waited),
              style: TextStyle(
                color: color,
                fontSize: 15,
                fontWeight: FontWeight.w700,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ],
        ),
      );
}
