import 'package:flutter/material.dart';

import '../api/client.dart';
import '../api/models.dart';
import '../theme/tokens.dart';
import 'admin_screen.dart';

/// Which receivers are hearing buttons, and which have gone quiet.
///
/// A silent receiver is the worst failure this system has, because it is
/// invisible from every other screen: the dashboard shows no calls, which looks
/// exactly like a quiet ward. One clinic was completely without coverage for
/// three and a half days before anybody noticed. The server has alerted on this
/// since; this is the same fact, on the phone of the person who can walk over
/// and look at the box.
class DevicesScreen extends StatelessWidget {
  const DevicesScreen({super.key, required this.api});

  final ApiClient api;

  @override
  Widget build(BuildContext context) => AdminList<Device>(
    title: 'Qabul qilgichlar',
    load: () async {
      final devices = await api.devices();
      // Offline first. A list sorted by floor hides the one row that needs
      // attention somewhere in the middle of the ones that are fine.
      return [...devices]..sort((a, b) {
        if (a.online != b.online) return a.online ? 1 : -1;
        return a.floor.compareTo(b.floor);
      });
    },
    empty:
        'Qabul qilgich ro‘yxatdan o‘tkazilmagan.\n'
        'Yangi qurilma ulanganda o‘zi paydo bo‘ladi.',
    header: (context, items) {
      final offline = items.where((d) => !d.online).length;
      if (items.isEmpty) return const SizedBox.shrink();
      final p = Palette.of(context);
      final allDown = offline == items.length;
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          decoration: BoxDecoration(
            color: offline == 0
                ? p.bannerBg(p.accentOk)
                : p.bannerBg(p.dangerInk),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: (offline == 0 ? p.accentOk : p.dangerInk).withValues(
                alpha: 0.35,
              ),
            ),
          ),
          child: Row(
            children: [
              Icon(
                offline == 0 ? Icons.verified : Icons.warning_amber_rounded,
                size: 20,
                color: offline == 0 ? p.accentOk : p.dangerInk,
              ),
              const SizedBox(width: 11),
              Expanded(
                child: Text(
                  offline == 0
                      ? '${items.length} ta qabul qilgich ishlayapti'
                      : allDown
                      // Said separately because it is a different event: not a
                      // broken box but a clinic with no coverage at all.
                      ? 'Hech bir qabul qilgich ishlamayapti — klinika qoplanmagan'
                      : '$offline ta qabul qilgich jim — o‘sha qavatda tugma bosilsa hech narsa bo‘lmaydi',
                  style: TextStyle(
                    color: p.text1,
                    fontSize: 13.5,
                    height: 1.4,
                    fontWeight: offline == 0
                        ? FontWeight.w500
                        : FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    },
    itemBuilder: (context, device, reload) => _DeviceRow(device: device),
  );
}

class _DeviceRow extends StatelessWidget {
  const _DeviceRow({required this.device});

  final Device device;

  /// How long ago, in words a person uses. Exact minutes matter here in a way
  /// they do not elsewhere: "2 daqiqa" is a working receiver mid-heartbeat,
  /// "3 kun" is a box somebody has to go and look at.
  static String _ago(DateTime? t) {
    if (t == null) return 'hech qachon ulanmagan';
    final d = DateTime.now().toUtc().difference(t.toUtc());
    if (d.inMinutes < 1) return 'hozirgina';
    if (d.inMinutes < 60) return '${d.inMinutes} daqiqa oldin';
    if (d.inHours < 24) return '${d.inHours} soat oldin';
    return '${d.inDays} kun oldin';
  }

  @override
  Widget build(BuildContext context) {
    final p = Palette.of(context);
    final tint = device.online
        ? p.accentOk
        : device.neverSeen
        ? p.warnInk
        : p.dangerInk;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        decoration: BoxDecoration(
          color: p.card,
          borderRadius: BorderRadius.circular(13),
          border: Border.all(
            color: device.online ? p.border : tint.withValues(alpha: 0.4),
          ),
        ),
        padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
        child: Row(
          children: [
            Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(color: tint, shape: BoxShape.circle),
            ),
            const SizedBox(width: 13),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    device.deviceId,
                    style: TextStyle(
                      color: p.text1,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${device.floor}-qavat · ${_ago(device.lastSeenAt)}',
                    style: TextStyle(color: p.text3, fontSize: 12.5),
                  ),
                ],
              ),
            ),
            Text(
              device.online
                  ? 'ishlayapti'
                  : device.neverSeen
                  // Never connected is a setup mistake, not an outage: the box
                  // was registered and then never plugged in or configured.
                  ? 'sozlanmagan'
                  : 'jim',
              style: TextStyle(
                color: tint,
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
