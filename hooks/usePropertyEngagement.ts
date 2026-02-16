"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import posthog from "posthog-js";

interface PropertyEngagementData {
  id: string;
  propertyType?: string;
  price?: string;
  city?: string;
  quartier?: string;
}

interface UsePropertyEngagementParams {
  isOpen: boolean;
  property: PropertyEngagementData | null;
  viewerType: string;
}

const SESSION_VIEWED_PROPERTIES_KEY = "roogo:web:session:viewed-properties";

function getSessionPropertyCount(propertyId: string): number {
  if (typeof window === "undefined") {
    return 1;
  }

  const raw = window.sessionStorage.getItem(SESSION_VIEWED_PROPERTIES_KEY);
  const ids = new Set<string>(raw ? JSON.parse(raw) as string[] : []);
  ids.add(propertyId);
  window.sessionStorage.setItem(SESSION_VIEWED_PROPERTIES_KEY, JSON.stringify([...ids]));
  return ids.size;
}

export function usePropertyEngagement({
  isOpen,
  property,
  viewerType,
}: UsePropertyEngagementParams) {
  const openedAt = useRef<number | null>(null);
  const lastVisibleAt = useRef<number | null>(null);
  const accumulatedMs = useRef(0);
  const maxScrollDepth = useRef(0);
  const imagesViewed = useRef(0);
  const contactClicked = useRef(false);
  const hasTrackedCurrentOpen = useRef(false);

  const propertyId = useMemo(() => property?.id ?? null, [property?.id]);

  const flushTracking = useCallback(() => {
    if (!property || !propertyId || hasTrackedCurrentOpen.current) {
      return;
    }

    const now = Date.now();
    if (lastVisibleAt.current !== null) {
      accumulatedMs.current += now - lastVisibleAt.current;
      lastVisibleAt.current = now;
    }

    const activeSeconds = Math.round(accumulatedMs.current / 1000);

    if (activeSeconds >= 3) {
      const sessionPropertyCount = getSessionPropertyCount(propertyId);

      posthog.capture("property_viewed", {
        property_id: propertyId,
        property_type: property.propertyType ?? null,
        price: property.price ? Number(property.price) : 0,
        city: property.city ?? null,
        quartier: property.quartier ?? null,
        viewer_type: viewerType,
        time_on_page: activeSeconds,
        scroll_depth: maxScrollDepth.current,
        images_viewed: imagesViewed.current,
        contact_clicked: contactClicked.current,
        session_property_count: sessionPropertyCount,
      });
    }

    hasTrackedCurrentOpen.current = true;
  }, [property, propertyId, viewerType]);

  useEffect(() => {
    if (!isOpen || !propertyId) {
      return;
    }

    openedAt.current = Date.now();
    lastVisibleAt.current = openedAt.current;
    accumulatedMs.current = 0;
    maxScrollDepth.current = 0;
    imagesViewed.current = 0;
    contactClicked.current = false;
    hasTrackedCurrentOpen.current = false;

    const handleVisibilityChange = () => {
      const now = Date.now();
      if (document.hidden) {
        if (lastVisibleAt.current !== null) {
          accumulatedMs.current += now - lastVisibleAt.current;
          lastVisibleAt.current = null;
        }
      } else {
        lastVisibleAt.current = now;
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flushTracking();
    };
  }, [flushTracking, isOpen, propertyId]);

  useEffect(() => {
    if (!isOpen && propertyId) {
      flushTracking();
    }
  }, [flushTracking, isOpen, propertyId]);

  return {
    trackImageView: () => {
      imagesViewed.current += 1;
    },
    trackContactClick: () => {
      contactClicked.current = true;
    },
    trackScrollDepth: (currentScroll: number, maxScroll: number) => {
      if (maxScroll <= 0) {
        return;
      }
      const percent = Math.min(100, Math.max(0, Math.round((currentScroll / maxScroll) * 100)));
      if (percent > maxScrollDepth.current) {
        maxScrollDepth.current = percent;
      }
    },
  };
}
