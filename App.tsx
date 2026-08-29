import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AddAssignmentScreen } from './src/screens/AddAssignmentScreen';
import { HomeScreen } from './src/screens/HomeScreen';

type Screen = 'home' | 'add';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {currentScreen === 'home' ? (
        <HomeScreen onNavigateToAdd={() => setCurrentScreen('add')} />
      ) : (
        <AddAssignmentScreen onNavigateBack={() => setCurrentScreen('home')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
});
