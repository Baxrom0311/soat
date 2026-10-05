import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../core/age.dart';
import '../theme/tokens.dart';

/// One waiting patient, transcribed from the approved design.
///
/// Sizes are the design's own, converted from its Tailwind classes: card
/// `rounded-2xl` and `p-4`, room number `text-[56px]`, button `h-[52px]` and
/// `rounded-xl`. They are written as plain numbers rather than a scale because
/// there is one screen that matters here and matching it exactly is the point.
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

  /// Nullable would be wrong: a card a nurse cannot answer has no business on
  /// this screen. The wall display, which genuinely only shows, is a different
  /// surface with a different widget.
  final Future<void> Function() onAcknowledge;

  final bool busy;

  @override
  Widget build(BuildContext context) {
    final waited = call.waited(now);
    final s = T.step(ageStep(waited), Theme.of(context).brightness);

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: s.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: s.border.withValues(alpha: s.borderOpacity),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            // In light mode this is what separates a white card from a
            // near-white page; in dark mode it is the step's own glow.
            color: T.palette(Theme.of(context).brightness).cardShadow
                ? Colors.black.withValues(alpha: 0.10)
                : s.glow.withValues(alpha: s.glowOpacity * 0.45),
            blurRadius: 22,
            spreadRadius: -4,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          // Bleeds in from a corner and is clipped by the card, so it reads as
          // light inside the card rather than a halo around it.
          Positioned(
            right: -32,
            top: s.ambientAtTop ? -32 : null,
            bottom: s.ambientAtTop ? null : -32,
            child: IgnorePointer(
              child: Container(
                width: s.ambientSize,
                height: s.ambientSize,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [
                      s.ambient.withValues(alpha: s.ambientOpacity),
                      s.ambient.withValues(alpha: 0),
                    ],
                  ),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    // Room number and floor share whatever the timer does not need,
                    // and the number takes priority within that. An earlier version
                    // put the number in a Flexible next to a Spacer -- both default to
                    // flex 1, so they split the free space evenly and "204" rendered
                    // as "2...". Unit tests missed it because they checked the
                    // overflow case and never the ordinary one.
                    Expanded(
                      child: Row(
                        // Baseline-ish, as the design has it: the chip sits against
                        // the foot of the numeral rather than floating at its middle,
                        // which is what keeps the number reading as the headline and
                        // the floor as a footnote to it.
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Flexible(
                            child: Text(
                              call.roomNumber,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontFamily: T.mono,
                                fontSize: 56,
                                height: 1.0,
                                letterSpacing: -1.4,
                                fontWeight: FontWeight.w700,
                                // White, not the accent colour. The step reads from the glow
                                // behind the number and from everything around it; a white
                                // numeral stays the highest-contrast thing on the card at
                                // every step, which is what a nurse is actually reading.
                                color: s.numberInk,
                                shadows: [
                                  Shadow(
                                    color: s.glow.withValues(
                                      alpha: s.glowOpacity,
                                    ),
                                    blurRadius: 14,
                                    offset: const Offset(0, 2),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: _FloorChip(floor: call.floor, style: s),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    _Elapsed(waited: waited, style: s),
                  ],
                ),
                const SizedBox(height: 16),
                _AckButton(style: s, busy: busy, onPressed: onAcknowledge),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _FloorChip extends StatelessWidget {
  const _FloorChip({required this.floor, required this.style});

  final int floor;
  final CallStepStyle style;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
    decoration: BoxDecoration(
      color: style.chipBg.withValues(alpha: 0.90),
      borderRadius: BorderRadius.circular(6),
      border: Border.all(color: style.border.withValues(alpha: 0.40)),
    ),
    child: Text(
      '$floor-qavat',
      style: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w700,
        color: style.chipInk,
      ),
    ),
  );
}

class _Elapsed extends StatelessWidget {
  const _Elapsed({required this.waited, required this.style});

  final Duration waited;
  final CallStepStyle style;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
    decoration: BoxDecoration(
      color: style.chipBg.withValues(alpha: 0.80),
      borderRadius: BorderRadius.circular(999),
      border: Border.all(color: style.border.withValues(alpha: 0.60)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(style.timerIcon, size: 17, color: style.accent),
        const SizedBox(width: 6),
        Text(
          elapsedLabel(waited),
          style: TextStyle(
            fontFamily: T.mono,
            fontSize: 17,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.4,
            color: style.chipInk,
          ),
        ),
      ],
    ),
  );
}

class _AckButton extends StatelessWidget {
  const _AckButton({
    required this.style,
    required this.busy,
    required this.onPressed,
  });

  final CallStepStyle style;
  final bool busy;
  final Future<void> Function() onPressed;

  @override
  Widget build(BuildContext context) => Opacity(
    opacity: busy ? 0.6 : 1,
    child: Container(
      height: 52,
      decoration: BoxDecoration(
        gradient: style.buttonGradient,
        borderRadius: BorderRadius.circular(12),
        // A one-pixel light edge along the top only, as in the design: it
        // reads as a raised surface without the weight of a full border.
        border: Border(
          top: BorderSide(color: Colors.white.withValues(alpha: 0.30)),
        ),
        boxShadow: [
          BoxShadow(
            color: style.buttonFrom.withValues(alpha: 0.5),
            blurRadius: 22,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: busy
              ? null
              : () {
                  HapticFeedback.mediumImpact();
                  onPressed();
                },
          child: Center(
            child: busy
                ? SizedBox(
                    width: 21,
                    height: 21,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.4,
                      valueColor: AlwaysStoppedAnimation(style.buttonInk),
                    ),
                  )
                : Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.check_circle,
                        size: 22,
                        color: style.buttonInk,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'Qabul qilish',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: style.buttonInk,
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ),
    ),
  );
}
