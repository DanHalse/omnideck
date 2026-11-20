import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ServiceDefinition } from '@omnideck/shared';
import type { MobilePalette } from '../theme';
import { ServiceSvgIcon } from './ServiceSvgIcon';

interface BottomNavBarProps {
  palette: MobilePalette;
  services: ServiceDefinition[];
  activeServiceId: string;
  mountedIds: Set<string>;
  hibernatedIds: Set<string>;
  mutedIds: Set<string>;
  onSelectService: (id: string) => void;
  onOpenManage: () => void;
}

export function BottomNavBar({
  palette,
  services,
  activeServiceId,
  mountedIds,
  hibernatedIds,
  mutedIds,
  onSelectService,
  onOpenManage,
}: BottomNavBarProps) {
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: palette.chrome,
          borderTopColor: palette.border,
        },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {services.map((svc) => {
          const isActive = svc.id === activeServiceId;
          const isMounted = mountedIds.has(svc.id);
          const isHibernated = hibernatedIds.has(svc.id);
          const isMuted = mutedIds.has(svc.id);

          return (
            <Pressable
              key={svc.id}
              onPress={() => onSelectService(svc.id)}
              style={[
                styles.item,
                isActive && {
                  backgroundColor: palette.surfaceActive,
                },
                isHibernated && styles.itemHibernated,
              ]}
            >
              {isActive && (
                <View style={[styles.indicator, { backgroundColor: svc.accentColor }]} />
              )}

              <View style={styles.iconWrap}>
                <ServiceSvgIcon
                  icon={svc.icon}
                  size={20}
                  color={isActive ? svc.accentColor : palette.inkSecondary}
                />
                {isMounted && !isHibernated && (
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor: isMuted ? palette.danger : palette.live,
                        borderColor: palette.chrome,
                      },
                    ]}
                  />
                )}
              </View>

              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  { color: isActive ? palette.inkPrimary : palette.inkSecondary },
                ]}
              >
                {svc.shortName}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          onPress={onOpenManage}
          style={[styles.item, styles.addBtn, { borderColor: palette.border }]}
        >
          <Text style={[styles.addGlyph, { color: palette.inkSecondary }]}>＋</Text>
          <Text style={[styles.label, { color: palette.inkSecondary }]}>Apps</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
  },
  scrollContent: {
    paddingHorizontal: 8,
    gap: 6,
    alignItems: 'center',
  },
  item: {
    minWidth: 64,
    height: 52,
    paddingHorizontal: 10,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    position: 'relative',
  },
  itemHibernated: {
    opacity: 0.55,
  },
  indicator: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: 2.5,
    borderRadius: 2,
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    position: 'absolute',
    top: -2,
    right: -5,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  addBtn: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  addGlyph: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '500',
  },
});
