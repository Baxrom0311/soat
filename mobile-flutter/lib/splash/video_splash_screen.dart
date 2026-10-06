import 'dart:async';
import 'package:flutter/material.dart';

/// Fullscreen intro splash animation screen shown at app launch.
/// Plays optimized high-definition `assets/images/splash.gif` while preloading session,
/// settings, and network socket connections.
class VideoSplashScreen extends StatefulWidget {
  const VideoSplashScreen({super.key, required this.onFinished});

  final VoidCallback onFinished;

  @override
  State<VideoSplashScreen> createState() => _VideoSplashScreenState();
}

class _VideoSplashScreenState extends State<VideoSplashScreen> {
  Timer? _timer;
  bool _finished = false;

  @override
  void initState() {
    super.initState();
    // Complete after exactly 3.8 seconds (duration of the intro animation)
    _timer = Timer(const Duration(milliseconds: 3800), _finish);
  }

  void _finish() {
    if (_finished) return;
    _finished = true;
    _timer?.cancel();
    widget.onFinished();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Center(
        child: Image.asset(
          'assets/images/splash.gif',
          fit: BoxFit.contain,
          gaplessPlayback: true,
        ),
      ),
    );
  }
}
