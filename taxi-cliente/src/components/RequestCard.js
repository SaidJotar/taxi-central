import { View, Text, TouchableOpacity, StyleSheet } from "react-native"

export default function RequestCard({ onRequest }) {

  return (
    <View style={styles.card}>

      <Text style={styles.title}>
        ¿A dónde vamos?
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={onRequest}
      >
        <Text style={styles.buttonText}>
          Pedir taxi
        </Text>
      </TouchableOpacity>

    </View>
  )
}

const styles = StyleSheet.create({

  card: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: "white",
    padding: 20,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10
  },

  title: {
    fontSize: 18,
    marginBottom: 10
  },

  button: {
    backgroundColor: "black",
    padding: 15,
    borderRadius: 10
  },

  buttonText: {
    color: "white",
    textAlign: "center",
    fontSize: 16
  }

})