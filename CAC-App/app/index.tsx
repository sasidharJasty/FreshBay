import { Redirect } from 'expo-router';

import { useAuth } from '@/app/context/auth';

export default function IndexRoute() {
  const auth = useAuth();

  if (!auth?.hydrated) {
    return null;
  }

  if (!auth?.token) {
    return null;
  }

  const target = auth.role === 'volunteer'
    ? '/(tabs)/volunteers/home'
    : auth.role === 'charity'
    ? '/(tabs)/families/home'
    : '/(tabs)/donors/home';

  return <Redirect href={target} />;
}
