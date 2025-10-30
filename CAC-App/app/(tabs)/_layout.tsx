import { Tabs } from 'expo-router';
import React, { useMemo } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '@/app/context/auth';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const ALL_TABS = [
  // Families / Recipients (charity role)
  { name: 'families/home', title: 'Home', icon: 'house.fill', roles: ['charity'] },
  { name: 'families/available', title: 'Available Food', icon: 'cart.fill', roles: ['charity'] },
  { name: 'families/claims', title: 'My Claims', icon: 'cube.box.fill', roles: ['charity'] },
  { name: 'families/aid', title: 'Aid & Benefits', icon: 'heart.fill', roles: ['charity'] },
  { name: 'families/agritourism', title: 'Agritourism', icon: 'leaf.fill', roles: ['charity'] },
  { name: 'families/profile', title: 'Profile', icon: 'person.crop.circle', roles: ['charity'] },

  // Donors
  { name: 'donors/home', title: 'Home', icon: 'house.fill', roles: ['donor'] },
  { name: 'donors/donate', title: 'Donate', icon: 'camera.fill', roles: ['donor'] },
  { name: 'donors/analytics', title: 'Analytics', icon: 'chart.bar.fill', roles: ['donor'] },
  { name: 'donors/impact', title: 'Impact', icon: 'leaf.fill', roles: ['donor'] },
  { name: 'donors/profile', title: 'Profile', icon: 'person.crop.circle', roles: ['donor'] },

  // Volunteers
  { name: 'volunteers/home', title: 'Routes', icon: 'map.fill', roles: ['volunteer'] },
  { name: 'volunteers/tasks', title: 'Available Tasks', icon: 'bolt.fill', roles: ['volunteer'] },
  { name: 'volunteers/active', title: 'Active', icon: 'car.fill', roles: ['volunteer'] },
  { name: 'volunteers/impact', title: 'Impact', icon: 'leaf.fill', roles: ['volunteer'] },
  { name: 'volunteers/profile', title: 'Profile', icon: 'person.crop.circle', roles: ['volunteer'] },
];

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const auth: any = useAuth();
  const role = auth?.role;

  const normalizedRole = useMemo(() => {
    if (role === 'donor' || role === 'volunteer' || role === 'charity') {
      return role;
    }
    return null;
  }, [role]);

  const visibleTabs = useMemo(() => {
    if (!normalizedRole) return [];
    return ALL_TABS.filter((tab) => tab.roles.includes(normalizedRole));
  }, [normalizedRole]);

  const initialRoute = visibleTabs[0]?.name ?? 'families/home';
  const isLoading = auth?.loading || !normalizedRole;

  // render a loader while auth state is resolving to avoid flashing the wrong tabs
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Tabs
      key={normalizedRole}
      initialRouteName={initialRoute}
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
      }}>
      {ALL_TABS.map((t) => {
        const isVisible = visibleTabs.some((vt) => vt.name === t.name);
        return (
          <Tabs.Screen
            key={t.name}
            name={t.name}
            options={{
              title: t.title,
              tabBarIcon: ({ color }) => <IconSymbol size={28} name={t.icon as any} color={color} />,
              tabBarButton: isVisible ? (props) => <HapticTab {...props} /> : undefined,
              href: isVisible ? undefined : null,
            }}
          />
        );
      })}
    </Tabs>
  );
}
