import { useEffect, useState } from "react"
import * as Location from "expo-location"

import MapViewUber from "../components/MapViewUber"
import RequestCard from "../components/RequestCard"
import { api } from "../api/client"
import { useRide } from "../context/RideContext"

export default function HomeScreen() {

  const [location, setLocation] = useState(null)

  const { setRide } = useRide()

  useEffect(() => {

    async function init() {

      const { status } = await Location.requestForegroundPermissionsAsync()

      if (status !== "granted") return

      const loc = await Location.getCurrentPositionAsync({})

      setLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude
      })
    }

    init()

  }, [])

  async function solicitarTaxi() {

    const res = await api.solicitarTaxi({

      nombreCliente: "Cliente app",

      telefonoCliente: "+34600000000",

      lat: location.latitude,

      lng: location.longitude
    })

    setRide(res)
  }

  return (
    <>
      <MapViewUber location={location} />
      <RequestCard onRequest={solicitarTaxi} />
    </>
  )
}