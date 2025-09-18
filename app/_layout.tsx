import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, Platform } from 'react-native';

function InnerLayout() {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ 
      flex: 1, 
      paddingTop: Platform.OS === 'android' ? insets.top : 0,
      paddingBottom: Platform.OS === 'android' ? insets.bottom : 0,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      backgroundColor: 'white'
    }}>
      <StatusBar 
        style="dark" 
        translucent 
        backgroundColor="transparent" 
        hideTransitionAnimation="fade"
      />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { 
            backgroundColor: 'white',
            flex: 1
          },
          animation: 'slide_from_right',
        }}
      />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <InnerLayout />
    </SafeAreaProvider>
  );
}
