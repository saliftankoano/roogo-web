"use client";

import { useEffect } from "react";
import Link from "next/link";
import posthog from "posthog-js";
import type { TutorialFormat, TutorialTopic, TutorialVoice } from "@/lib/tutorials";

type TutorialAnalyticsProps = {
  event: "tutorial_list_viewed" | "tutorial_opened";
  tutorialSlug?: string;
  topic?: TutorialTopic;
  sourceScreen: string;
};

export function TutorialAnalytics({
  event,
  tutorialSlug,
  topic,
  sourceScreen,
}: TutorialAnalyticsProps) {
  useEffect(() => {
    posthog.capture(event, {
      tutorial_slug: tutorialSlug,
      topic,
      source_screen: sourceScreen,
      platform: "web",
    });
  }, [event, sourceScreen, topic, tutorialSlug]);

  return null;
}

type TrackedTutorialLinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
  event: "tutorial_opened" | "tutorial_video_opened" | "tutorial_article_cta_clicked";
  tutorialSlug: string;
  topic: TutorialTopic;
  sourceScreen: string;
  format?: TutorialFormat;
  voice?: TutorialVoice;
  videoId?: string;
  external?: boolean;
};

export function TrackedTutorialLink({
  href,
  children,
  className,
  event,
  tutorialSlug,
  topic,
  sourceScreen,
  format,
  voice,
  videoId,
  external = false,
}: TrackedTutorialLinkProps) {
  const handleClick = () => {
    posthog.capture(event, {
      tutorial_slug: tutorialSlug,
      topic,
      format,
      voice,
      video_id: videoId,
      source_screen: sourceScreen,
      platform: "web",
    });
  };

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onClick={handleClick}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
