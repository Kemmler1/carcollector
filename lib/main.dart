import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

void main() {
  runApp(const MapCenterApp());
}

class MapCenterApp extends StatelessWidget {
  const MapCenterApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Centered Map',
      theme: ThemeData(useMaterial3: true),
      home: const CenteredMapScreen(),
    );
  }
}

class CenteredMapScreen extends StatefulWidget {
  const CenteredMapScreen({super.key});

  @override
  State<CenteredMapScreen> createState() => _CenteredMapScreenState();
}

class _CenteredMapScreenState extends State<CenteredMapScreen> {
  final MapController mapController = MapController();
  LatLng? userLocation;

  @override
  void initState() {
    super.initState();
    _initLocation();
  }

  Future<void> _initLocation() async {
    final locationPermission = await Permission.location.request();
    if (!locationPermission.isGranted) return;

    final position = await Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.high,
    );

    setState(() {
      userLocation = LatLng(position.latitude, position.longitude);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (userLocation == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      body: Stack(
        children: [
          FlutterMap(
            mapController: mapController,
            options: MapOptions(
              initialCenter: userLocation!,
              initialZoom: 16,
              maxZoom: 18,
              minZoom: 3,
              interactionOptions: const InteractionOptions(
                flags: InteractiveFlag.pinchZoom | InteractiveFlag.doubleTapZoom,
              ),
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                subdomains: const ['a', 'b', 'c'],
              ),
            ],
          ),
          // Fixed dot in the center
          const Center(
            child: Icon(
              Icons.circle,
              color: Colors.blue,
              size: 14,
            ),
          ),
        ],
      ),
    );
  }
}
