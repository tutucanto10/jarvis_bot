import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { LogoMap } from "./logos";
import type { OrderedScores } from "./order";
import type { Game, TeamResult } from "./scores";

export const IMAGE_WIDTH = 1080;
export const MAX_IMAGE_HEIGHT = 2500;
/** Telegram albums hold at most 10 photos. */
const MAX_PAGES = 10;

// Fixed sizes so the height can be computed before rendering (satori needs it up front).
const PAD = 56;
const HEADER_H = 130;
const BLOCK_TITLE_H = 72;
const ROW_H = 104;
const BLOCK_GAP = 48;
const FAVORITE_PAD = 28;

const COLORS = {
  bg: "#0d0f14",
  card: "#161a22",
  text: "#f4f5f7",
  muted: "#8b93a1",
  line: "#262b36",
  accent: "#e5262d",
};

interface Block {
  title: string;
  games: Game[];
  favorite: boolean;
}

function blockHeight(b: Block): number {
  return BLOCK_TITLE_H + b.games.length * ROW_H + (b.favorite ? FAVORITE_PAD * 2 : 0);
}

const pageHeight = (blocks: Block[]) =>
  PAD * 2 + HEADER_H + blocks.reduce((h, b, i) => h + blockHeight(b) + (i ? BLOCK_GAP : 0), 0);

/** Splits blocks across pages under MAX_IMAGE_HEIGHT, breaking a long block into parts if needed. */
export function paginate(scores: OrderedScores, favoriteLabel: string): Block[][] {
  const blocks: Block[] = [];
  if (scores.favorites.length) blocks.push({ title: favoriteLabel, games: scores.favorites, favorite: true });
  blocks.push(...scores.leagues.map((l) => ({ title: l.leagueName, games: l.games, favorite: false })));

  const maxRows = Math.floor((MAX_IMAGE_HEIGHT - PAD * 2 - HEADER_H - BLOCK_TITLE_H - FAVORITE_PAD * 2) / ROW_H);
  const pieces = blocks.flatMap((b) => {
    const parts: Block[] = [];
    for (let i = 0; i < b.games.length; i += maxRows) {
      parts.push({ ...b, title: i ? `${b.title} (cont.)` : b.title, games: b.games.slice(i, i + maxRows) });
    }
    return parts;
  });

  const pages: Block[][] = [];
  for (const piece of pieces) {
    const page = pages.at(-1);
    if (page && pageHeight([...page, piece]) <= MAX_IMAGE_HEIGHT) page.push(piece);
    else pages.push([piece]);
  }
  return pages.slice(0, MAX_PAGES);
}

function Logo({ team, logos }: { team: TeamResult; logos: LogoMap }) {
  const src = team.logoUrl ? logos.get(team.logoUrl) : undefined;
  if (src) return <img src={src} width={64} height={64} style={{ objectFit: "contain" }} />;
  return (
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: 32,
        background: COLORS.line,
        color: COLORS.text,
        fontSize: 20,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {team.abbreviation.slice(0, 4)}
    </div>
  );
}

function TeamSide({ team, logos, align }: { team: TeamResult; logos: LogoMap; align: "left" | "right" }) {
  const name = (
    <div
      style={{
        display: "flex",
        flex: 1,
        justifyContent: align === "left" ? "flex-start" : "flex-end",
        fontSize: 36,
        fontWeight: team.winner ? 700 : 400,
        color: team.winner ? COLORS.text : COLORS.muted,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}
    >
      {team.name}
    </div>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, width: 380 }}>
      {align === "left" ? [<Logo key="l" team={team} logos={logos} />, name] : [name, <Logo key="l" team={team} logos={logos} />]}
    </div>
  );
}

function Row({ game, logos }: { game: Game; logos: LogoMap }) {
  const score = (t: TeamResult) => (
    <span style={{ fontWeight: t.winner ? 700 : 400, color: t.winner ? COLORS.text : COLORS.muted }}>{t.score}</span>
  );
  const shootout = game.home.shootoutScore != null && game.away.shootoutScore != null;
  return (
    <div style={{ display: "flex", alignItems: "center", height: ROW_H, borderTop: `1px solid ${COLORS.line}` }}>
      <TeamSide team={game.home} logos={logos} align="left" />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
        <div style={{ display: "flex", gap: 14, fontSize: 44 }}>
          {score(game.home)}
          <span style={{ color: COLORS.muted }}>x</span>
          {score(game.away)}
        </div>
        {shootout && (
          <div style={{ display: "flex", fontSize: 20, color: COLORS.muted }}>
            {`pên. ${game.home.shootoutScore} x ${game.away.shootoutScore}`}
          </div>
        )}
      </div>
      <TeamSide team={game.away} logos={logos} align="right" />
    </div>
  );
}

function BlockView({ block, logos }: { block: Block; logos: LogoMap }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        ...(block.favorite && {
          background: COLORS.card,
          borderLeft: `10px solid ${COLORS.accent}`,
          borderRadius: 24,
          padding: `${FAVORITE_PAD}px 32px`,
        }),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, height: BLOCK_TITLE_H, fontSize: 34, fontWeight: 700 }}>
        {block.favorite && (
          <div style={{ display: "flex" }}>
            <div style={{ width: 18, height: 36, background: COLORS.accent }} />
            <div style={{ width: 18, height: 36, background: "#000" }} />
          </div>
        )}
        <span style={{ color: block.favorite ? COLORS.text : COLORS.muted, textTransform: "uppercase", letterSpacing: 2 }}>
          {block.title}
        </span>
      </div>
      {block.games.map((g) => (
        <Row key={`${g.leagueId}:${g.id}`} game={g} logos={logos} />
      ))}
    </div>
  );
}

function Page({ title, blocks, logos, page, pages }: { title: string; blocks: Block[]; logos: LogoMap; page: number; pages: number }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: COLORS.bg,
        color: COLORS.text,
        padding: PAD,
        fontFamily: "Work Sans",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", height: HEADER_H }}>
        <div style={{ display: "flex", fontSize: 52, fontWeight: 700 }}>{title}</div>
        {pages > 1 && <div style={{ display: "flex", fontSize: 30, color: COLORS.muted }}>{`${page}/${pages}`}</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: BLOCK_GAP }}>
        {blocks.map((b, i) => (
          <BlockView key={i} block={b} logos={logos} />
        ))}
      </div>
    </div>
  );
}

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 700; style: "normal" }[]> | undefined;

function loadFonts() {
  const dir = path.join(process.cwd(), "assets", "fonts");
  fonts ??= Promise.all([
    readFile(path.join(dir, "WorkSans-Regular.ttf")).then((data) => ({ name: "Work Sans", data, weight: 400 as const, style: "normal" as const })),
    readFile(path.join(dir, "WorkSans-Bold.ttf")).then((data) => ({ name: "Work Sans", data, weight: 700 as const, style: "normal" as const })),
  ]);
  return fonts;
}

export type ScoresRenderer = (input: {
  scores: OrderedScores;
  title: string;
  favoriteLabel: string;
  logos: LogoMap;
}) => Promise<Buffer[]>;

/** One PNG per page; most days fit in one. */
export const renderScoresImages: ScoresRenderer = async ({ scores, title, favoriteLabel, logos }) => {
  const pages = paginate(scores, favoriteLabel);
  const fontData = await loadFonts();
  return Promise.all(
    pages.map(async (blocks, i) => {
      const response = new ImageResponse(
        <Page title={title} blocks={blocks} logos={logos} page={i + 1} pages={pages.length} />,
        { width: IMAGE_WIDTH, height: pageHeight(blocks), fonts: fontData },
      );
      return Buffer.from(await response.arrayBuffer());
    }),
  );
};
