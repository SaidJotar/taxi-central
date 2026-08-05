import MapView, { Marker } from "react-native-maps"
import { View } from "react-native"

export default function MapViewUber({ location }) {

  if (!location) return null

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01
        }}
      >
        <Marker coordinate={location} />
      </MapView>
    </View>
  )
}