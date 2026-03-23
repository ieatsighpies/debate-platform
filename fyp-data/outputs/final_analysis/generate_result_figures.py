from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns

# ---------------------------------------------------------------------------
# Shared constants — labels match the report exactly
# ---------------------------------------------------------------------------

CONDITION_ORDER = ["human-human", "firm", "balanced", "open-minded"]

CONDITION_LABELS = {
    "human-human": "Human-Human",
    "firm": "Firm AI",
    "balanced": "Balanced AI",
    "open-minded": "Open-minded AI",
}

# Palette used by belief trajectory; reused for any per-condition colour work
CONDITION_PALETTE = {
    "human-human": "#1f7a8c",
    "firm": "#bf3f3f",
    "balanced": "#6c8f2e",
    "open-minded": "#7d5ba6",
}

# Shared sizing / typography
FIG_W, FIG_H       = 11, 6.5   # default figure size (inches)
TITLE_FONTSIZE     = 18
TITLE_PAD          = 14
BOX_COLOR          = "#c7d3dd"  # neutral box fill for condition-level plots
STRIP_COLOR        = "#334e68"  # dot colour for stripplot
MEAN_COLOR         = "#c0392b"  # red mean ± CI marker
GRID_ALPHA         = 0.24
ZERO_LINE_COLOR    = "#7a7a7a"
ZERO_LINE_WIDTH    = 1.2
TRAJECTORY_MIN_N   = 3


def _style() -> None:
    sns.set_theme(style="whitegrid", context="talk")


def audit_belief_change_mean_marker(final_analysis_dir: Path) -> None:
    """Print condition means used by the Image 2 red mean marker."""
    participant = pd.read_csv(final_analysis_dir / "analysis_participant_table.csv")
    means = (
        participant.dropna(subset=["belief_change", "condition"])
        .groupby("condition")["belief_change"]
        .mean()
        .reindex(CONDITION_ORDER)
    )
    print("Belief-change means by condition (Image 2 marker audit):")
    print(means.to_string())
    print(f"Balanced mean marker y-value: {means.loc['balanced']:.3f}")


# ---------------------------------------------------------------------------
# Helper: add mean ± 95 CI overlay to a boxplot axis
# ---------------------------------------------------------------------------

def _add_mean_ci(ax, plot_df: pd.DataFrame, x_col: str, y_col: str) -> None:
    """Plot red mean ± 95 % CI markers on top of an existing boxplot."""
    label_order = [CONDITION_LABELS[c] for c in CONDITION_ORDER
                   if CONDITION_LABELS[c] in plot_df[x_col].values]
    for i, label in enumerate(label_order):
        vals = plot_df.loc[plot_df[x_col] == label, y_col].dropna()
        if vals.empty:
            continue
        mean = vals.mean()
        ci   = 1.96 * vals.std() / np.sqrt(len(vals))
        ax.errorbar(i, mean, yerr=ci, fmt="o",
                    color=MEAN_COLOR, ecolor=MEAN_COLOR,
                    elinewidth=1.8, capsize=5, markersize=7, zorder=5)


# ---------------------------------------------------------------------------
# Figure 1 — Belief Change by Condition  (missing from original script)
# ---------------------------------------------------------------------------

def plot_belief_change_by_condition(final_analysis_dir: Path) -> Path:
    """
    Debate-level belief change (post - pre) by condition.
    Matches report label: 'Belief Change by Condition (Post - Pre)'.
    """
    participant = pd.read_csv(final_analysis_dir / "analysis_participant_table.csv")
    plot_df = participant.dropna(subset=["belief_change", "condition"]).copy()
    plot_df = plot_df[plot_df["condition"].isin(CONDITION_ORDER)]
    plot_df["condition"] = pd.Categorical(
        plot_df["condition"], categories=CONDITION_ORDER, ordered=True
    )
    plot_df["condition_label"] = plot_df["condition"].map(CONDITION_LABELS)

    fig, ax = plt.subplots(figsize=(FIG_W, FIG_H))

    sns.boxplot(
        data=plot_df, x="condition_label", y="belief_change",
        order=[CONDITION_LABELS[c] for c in CONDITION_ORDER],
        color=BOX_COLOR, width=0.58, fliersize=0, ax=ax,
    )
    _add_mean_ci(ax, plot_df, "condition_label", "belief_change")

    ax.axhline(0, color=ZERO_LINE_COLOR, linewidth=ZERO_LINE_WIDTH, linestyle="--")
    ax.set_title("Belief Change by Condition (Post - Pre)",
                 fontsize=TITLE_FONTSIZE, pad=TITLE_PAD)
    ax.set_xlabel("Condition")
    ax.set_ylabel("Belief Change (Post - Pre)")
    ax.grid(axis="y", alpha=GRID_ALPHA)

    out_path = final_analysis_dir / "belief_change_by_condition.png"
    fig.tight_layout()
    fig.savefig(out_path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    return out_path


# ---------------------------------------------------------------------------
# Figure 2 — Confidence Change by Condition
# ---------------------------------------------------------------------------

def plot_confidence_change_by_condition(final_analysis_dir: Path) -> Path:
    """
    Debate-level confidence change (post - pre) by condition.
    Matches report label: 'Confidence Change by Condition'.
    """
    participant = pd.read_csv(final_analysis_dir / "analysis_participant_table.csv")
    plot_df = participant.dropna(subset=["confidence_change", "condition"]).copy()
    plot_df = plot_df[plot_df["condition"].isin(CONDITION_ORDER)]
    plot_df["condition"] = pd.Categorical(
        plot_df["condition"], categories=CONDITION_ORDER, ordered=True
    )
    plot_df["condition_label"] = plot_df["condition"].map(CONDITION_LABELS)

    fig, ax = plt.subplots(figsize=(FIG_W, FIG_H))

    sns.boxplot(
        data=plot_df, x="condition_label", y="confidence_change",
        order=[CONDITION_LABELS[c] for c in CONDITION_ORDER],
        color=BOX_COLOR, width=0.58, fliersize=0, ax=ax,
    )
    sns.stripplot(
        data=plot_df, x="condition_label", y="confidence_change",
        order=[CONDITION_LABELS[c] for c in CONDITION_ORDER],
        color=STRIP_COLOR, alpha=0.62, size=5.2, jitter=0.2, ax=ax,
    )

    ax.axhline(0, color=ZERO_LINE_COLOR, linewidth=ZERO_LINE_WIDTH, linestyle="--")
    ax.set_title("Confidence Change by Condition",
                 fontsize=TITLE_FONTSIZE, pad=TITLE_PAD)
    ax.set_xlabel("Condition")
    ax.set_ylabel("Confidence Change (Post - Pre)")
    ax.grid(axis="y", alpha=GRID_ALPHA)

    out_path = final_analysis_dir / "confidence_change_by_condition.png"
    fig.tight_layout()
    fig.savefig(out_path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    return out_path


# ---------------------------------------------------------------------------
# Figure 3 — Belief Trajectory Across Debate Rounds by Condition
# ---------------------------------------------------------------------------

def plot_belief_trajectory(
    final_analysis_dir: Path, fyp_data_root: Path, min_n_per_round: int = TRAJECTORY_MIN_N
) -> Path:
    """
    Round-level mean belief value by condition with 95 % CI bands.
    Annotates per-round n on first and last rounds to flag thin data.
    Matches report label: 'Belief Trajectory Across Debate Rounds by Condition'.
    """
    belief_history = pd.read_csv(fyp_data_root / "outputs" / "belief_history_p1.csv")

    traj = belief_history[
        belief_history["condition"].isin(CONDITION_ORDER)
        & (belief_history["player"] == "player1")
        & belief_history["belief_value"].notna()
    ].copy()

    agg = (
        traj.groupby(["condition", "round"], as_index=False)
        .agg(
            belief_mean=("belief_value", "mean"),
            belief_sd=("belief_value", "std"),
            n=("belief_value", "size"),
        )
        .sort_values(["condition", "round"])
    )
    agg["belief_sd"] = agg["belief_sd"].fillna(0)
    agg["sem"]  = agg["belief_sd"] / agg["n"].pow(0.5)
    agg["ci95"] = 1.96 * agg["sem"]
    agg["condition_label"] = agg["condition"].map(CONDITION_LABELS)

    print("Per-round n by condition for Image 3:")
    print(agg[["condition", "round", "n"]].to_string(index=False))

    # Truncate thin tails where round-level means are based on too few debates.
    plot_agg = agg[agg["n"] >= min_n_per_round].copy()
    if plot_agg.empty:
        raise ValueError(
            f"No rounds meet min_n_per_round={min_n_per_round}. Cannot plot trajectory."
        )

    max_round_all = agg.groupby("condition")["round"].max()
    max_round_plotted = plot_agg.groupby("condition")["round"].max()
    truncation = pd.concat(
        [max_round_all.rename("max_round_all"), max_round_plotted.rename("max_round_plotted")],
        axis=1,
    ).reindex(CONDITION_ORDER)
    print(f"\nTrajectory truncation summary (min n per round = {min_n_per_round}):")
    print(truncation.to_string())

    fig, ax = plt.subplots(figsize=(12, 7))

    for condition in CONDITION_ORDER:
        sub   = plot_agg[plot_agg["condition"] == condition]
        if sub.empty:
            continue
        color = CONDITION_PALETTE[condition]
        label = CONDITION_LABELS[condition]

        ax.plot(sub["round"], sub["belief_mean"],
                marker="o", linewidth=2.2, markersize=5.5,
                color=color, label=label)
        ax.fill_between(sub["round"],
                        sub["belief_mean"] - sub["ci95"],
                        sub["belief_mean"] + sub["ci95"],
                        color=color, alpha=0.14, linewidth=0)

        # Show n on every plotted point to make late-round reliability visible.
        for row in sub.itertuples(index=False):
            ax.annotate(
                f"n={int(row.n)}",
                xy=(row.round, row.belief_mean),
                xytext=(0, 6),
                textcoords="offset points",
                fontsize=8,
                color=color,
                ha="center",
                va="bottom",
            )

    ax.set_title(
        f"Belief Trajectory Across Debate Rounds by Condition (n>={min_n_per_round})",
        fontsize=TITLE_FONTSIZE,
        pad=TITLE_PAD,
    )
    ax.set_xlabel("Round")
    ax.set_ylabel("Mean Belief Value (0–100)")
    ax.set_ylim(0, 100)
    ax.set_xticks(sorted(plot_agg["round"].dropna().unique()))
    ax.grid(axis="y", alpha=GRID_ALPHA)
    ax.legend(title="Condition", frameon=True, loc="best")

    out_path = final_analysis_dir / "belief_trajectory_by_round_condition.png"
    fig.tight_layout()
    fig.savefig(out_path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    return out_path


# ---------------------------------------------------------------------------
# Figure 4 — Pooled AI Coefficient Across Primary Model Family (M1–M5)
# ---------------------------------------------------------------------------

def plot_ai_beta_ci_across_models(final_analysis_dir: Path) -> Path:
    """
    Forest plot of pooled AI beta with 95 % CI across primary model family.
    Matches report label: 'Pooled AI Effect Across Primary Model Family (M1–M5)'.
    """
    models    = pd.read_csv(final_analysis_dir / "primary_models.csv")
    wanted    = ["M1", "M2", "M3", "M4", "M4b","M4c", "M5"]
    m         = models[models["model"].isin(wanted)].copy()
    m["model"] = pd.Categorical(m["model"], categories=wanted, ordered=True)
    m          = m.sort_values("model")

    CONFIRMATORY_COLOR = "#1b4332"
    EXPLORATORY_COLOR  = "#6c757d"
    colors = [CONFIRMATORY_COLOR if t == "Confirmatory" else EXPLORATORY_COLOR
              for t in m["type"]]

    fig, ax = plt.subplots(figsize=(FIG_W, FIG_H))

    for idx, row in enumerate(m.itertuples(index=False)):
        ax.errorbar(
            x=row.ai_beta, y=idx,
            xerr=[[row.ai_beta - row.ai_ci_low], [row.ai_ci_high - row.ai_beta]],
            fmt="o", color=colors[idx], ecolor=colors[idx],
            elinewidth=2, capsize=4, markersize=8,
        )
        ax.text(row.ai_ci_high + 0.8, idx,
                f"R\u00b2={row.r2:.3f}",
                va="center", ha="left", fontsize=10, color="#3d3d3d")

    ax.axvline(0, color=ZERO_LINE_COLOR, linewidth=ZERO_LINE_WIDTH, linestyle="--")
    ax.set_yticks(range(len(m)))
    ax.set_yticklabels(m["model"])
    ax.invert_yaxis()
    ax.set_xlabel("AI Coefficient (beta) with 95% CI")
    ax.set_ylabel("Model")
    ax.set_title("Pooled AI Effect Across Primary Model Family (M1–M5)",
                 fontsize=TITLE_FONTSIZE, pad=TITLE_PAD)
    ax.grid(axis="x", alpha=GRID_ALPHA)

    out_path = final_analysis_dir / "ai_beta_ci_across_primary_models.png"
    fig.tight_layout()
    fig.savefig(out_path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    return out_path

# ---------------------------------------------------------------------------
# Figure 5 — Pooled AI vs Human-Human: Belief and Confidence Change
# ---------------------------------------------------------------------------

POOLED_ORDER  = ["Human-Human", "AI (Pooled)"]
POOLED_PALETTE = {"Human-Human": "#1f7a8c", "AI (Pooled)": "#bf3f3f"}


def _add_pooled_column(df: pd.DataFrame) -> pd.DataFrame:
    """Map conditions to Human-Human vs AI (Pooled)."""
    df = df.copy()
    df["group"] = df["condition"].map(
        lambda c: "Human-Human" if c == "human-human" else "AI (Pooled)"
        if c in CONDITION_ORDER else None
    )
    return df.dropna(subset=["group"])


def plot_pooled_ai_vs_human(final_analysis_dir: Path) -> Path:
    """
    Side-by-side belief change and confidence change for pooled AI vs Human-Human.
    Matches report framing: AI opponents pooled across firm/balanced/open-minded.
    """
    participant = pd.read_csv(final_analysis_dir / "analysis_participant_table.csv")
    plot_df = participant[participant["condition"].isin(CONDITION_ORDER)].copy()
    plot_df = _add_pooled_column(plot_df)
    plot_df["group"] = pd.Categorical(plot_df["group"],
                                      categories=POOLED_ORDER, ordered=True)

    fig, axes = plt.subplots(1, 2, figsize=(13, 6.5), sharey=False)

    for ax, outcome, ylabel, title in zip(
        axes,
        ["belief_change", "confidence_change"],
        ["Belief Change (Post - Pre)", "Confidence Change (Post - Pre)"],
        ["Belief Change: AI (Pooled) vs Human-Human",
         "Confidence Change: AI (Pooled) vs Human-Human"],
    ):
        sub = plot_df.dropna(subset=[outcome])

        sns.boxplot(
            data=sub, x="group", y=outcome,
            order=POOLED_ORDER,
            palette=POOLED_PALETTE,
            width=0.48, fliersize=0, ax=ax,
        )
        sns.stripplot(
            data=sub, x="group", y=outcome,
            order=POOLED_ORDER,
            palette=POOLED_PALETTE,
            alpha=0.55, size=5.2, jitter=0.18, ax=ax,
        )
        _add_mean_ci(ax, sub, "group", outcome)

        ax.axhline(0, color=ZERO_LINE_COLOR, linewidth=ZERO_LINE_WIDTH, linestyle="--")
        ax.set_title(title, fontsize=15, pad=TITLE_PAD)
        ax.set_xlabel("")
        ax.set_ylabel(ylabel)
        ax.grid(axis="y", alpha=GRID_ALPHA)

        # Annotate n per group
        for i, grp in enumerate(POOLED_ORDER):
            n = sub[sub["group"] == grp][outcome].dropna().shape[0]
            ax.text(i, ax.get_ylim()[0] + 1, f"n={n}",
                    ha="center", fontsize=9, color="#555555")

    fig.suptitle("Pooled AI vs Human-Human: Belief and Confidence Change",
                 fontsize=TITLE_FONTSIZE, y=1.01)
    fig.tight_layout()

    out_path = final_analysis_dir / "pooled_ai_vs_human_belief_confidence.png"
    fig.savefig(out_path, dpi=300, bbox_inches="tight")
    plt.close(fig)
    return out_path


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    final_analysis_dir = Path(__file__).resolve().parent
    fyp_data_root      = final_analysis_dir.parents[1]
    _style()
    audit_belief_change_mean_marker(final_analysis_dir)

    outputs = [
        plot_belief_change_by_condition(final_analysis_dir),
        plot_confidence_change_by_condition(final_analysis_dir),
        plot_belief_trajectory(final_analysis_dir, fyp_data_root),
        plot_ai_beta_ci_across_models(final_analysis_dir),
        plot_pooled_ai_vs_human(final_analysis_dir),
    ]

    for path in outputs:
        print(f"Wrote {path}")


if __name__ == "__main__":
    main()