import React from "react";
import {
  View,
  StyleSheet,
  ScrollView,
} from "react-native";
import {
  SafeAreaView,
} from "react-native-safe-area-context";

export default function AppScreen({
  children,
  scroll = false,
  contentStyle,
  style,
  edges = [],
}) {

  if (scroll) {

    return (
      <SafeAreaView
        style={[
          styles.safe,
          style,
        ]}
        edges={edges}
      >

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            contentStyle,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {children}

        </ScrollView>

      </SafeAreaView>
    );

  }


  return (
    <SafeAreaView
      style={[
        styles.safe,
        style,
      ]}
      edges={edges}
    >

      <View
        style={[
          styles.content,
          contentStyle,
        ]}
      >
        {children}
      </View>

    </SafeAreaView>
  );
}


const styles = StyleSheet.create({

  safe: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  content: {
    flex: 1,
    paddingHorizontal: 10,
    paddingTop: 8,
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 24,
  },

});