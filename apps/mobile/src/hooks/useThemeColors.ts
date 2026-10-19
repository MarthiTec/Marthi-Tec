import { useColorScheme } from 'react-native';
import { pickTheme, type ThemeColors } from '../theme/tokens';

export function useThemeColors(): ThemeColors {
  const scheme = useColorScheme();
  return pickTheme(scheme === 'dark' ? 'dark' : 'light');
}
