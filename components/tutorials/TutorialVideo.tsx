import { ArrowSquareOutIcon, PlayCircleIcon } from "@phosphor-icons/react/dist/ssr";
import type { Tutorial } from "@/lib/tutorials";
import { TrackedTutorialLink } from "./TutorialAnalytics";

export function TutorialVideo({ tutorial }: { tutorial: Tutorial }) {
  const primary = tutorial.videos.horizontal.alimata;
  const alternative = tutorial.videos.horizontal.jerome;

  return (
    <section aria-labelledby="video-heading" className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.16em] text-primary">
            Tutoriel vidéo
          </p>
          <h2 id="video-heading" className="mt-2 text-2xl font-black text-neutral-900">
            Suivre la démonstration avec Alimata
          </h2>
        </div>
        <span className="text-sm font-semibold text-neutral-500">Lecture facultative · sans autoplay</span>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-neutral-200 bg-black shadow-xl shadow-black/10">
        <div className="aspect-video">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${primary.id}`}
            title={primary.title}
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-neutral-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <TrackedTutorialLink
          href={primary.url}
          external
          event="tutorial_video_opened"
          tutorialSlug={tutorial.slug}
          topic={tutorial.topic}
          format={primary.format}
          voice={primary.voice}
          videoId={primary.id}
          sourceScreen="tutorial_article"
          className="inline-flex items-center gap-2 font-bold text-primary hover:text-primary-hover"
        >
          <PlayCircleIcon size={22} weight="fill" />
          Ouvrir la vidéo sur YouTube
          <ArrowSquareOutIcon size={16} weight="bold" />
        </TrackedTutorialLink>

        <p className="text-sm font-semibold text-neutral-600">
          Autre version :{" "}
          <TrackedTutorialLink
            href={alternative.url}
            external
            event="tutorial_video_opened"
            tutorialSlug={tutorial.slug}
            topic={tutorial.topic}
            format={alternative.format}
            voice={alternative.voice}
            videoId={alternative.id}
            sourceScreen="tutorial_article_alternative"
            className="text-neutral-900 underline decoration-primary/40 underline-offset-4 hover:text-primary"
          >
            voix Jérôme
          </TrackedTutorialLink>
        </p>
      </div>
    </section>
  );
}
