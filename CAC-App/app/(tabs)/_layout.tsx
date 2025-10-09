import { Tabs } from 'expo-router';
import React from 'react';
import { useAuth } from '../context/auth';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const auth: any = useAuth();
  const role = auth?.role;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="paperplane.fill" color={color} />,
        }}
      />
      {role === 'charity' || role === 'recipient' ? (
        <Tabs.Screen
          name="families"
          options={{
            title: 'Families',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.2.fill" color={color} />,
          }}
        />
      ) : null}

      {role === 'donor' ? (
        <Tabs.Screen
          name="donors"
          options={{
            title: 'Donors',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="bag.fill" color={color} />,
          }}
        />
      ) : null}

      {role === 'volunteer' ? (
        <Tabs.Screen
          name="volunteers"
          options={{
            title: 'Volunteers',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="car.fill" color={color} />,
          }}
        />
      ) : null}
    </Tabs>
  );
}
