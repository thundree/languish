import { LangItemProps } from "components/LangItem";
import { objectEntries } from "helpers";
import { colors, entries, Metrics } from "parsedData";
import React, { useContext } from "react";

export type Scale = "linear" | "log";

const defaultState = {
  searchTerm: "",
  trimmed: false,
  metricsAreExpanded: false,
  metric: "mean" as keyof Metrics,
  scale: "linear" as Scale,
  langList: [] as Omit<
    LangItemProps,
    "selected" | "onClick" | "onMouseOver" | "onMouseOut"
  >[],
  selectedLangs: new Set<string>(),
  highlighed: undefined as string | undefined,
};

// react context isnt very type-friendly, need to declare noops
const noopFuncs = {
  updateSearchTerm(searchTerm: string) {},
  toggleTrimmed() {},
  toggleMetricsAreExpanded() {},
  emptyList() {},
  resetList() {},
  changeMetric(metric: keyof Metrics) {},
  changeScale(scale: Scale) {},
  toggleSelected(name: string) {},
  setHighlighted(name?: string) {},
};

export const GlobalContext = React.createContext({
  ...defaultState,
  ...noopFuncs,
});

export const useGlobal = () => useContext(GlobalContext);

export class GlobalProvider extends React.Component<{}, typeof defaultState> {
  state = defaultState;

  constructor(props: {}) {
    super(props);

    // queuing because setState is asynchronous and each call depends on the previous one
    queueMicrotask(() => {
      this.constructList();
      queueMicrotask(() => {
        this.resetList();
        queueMicrotask(() => this.loadUrlParams());
      });
    });
  }

  updateSearchTerm = (searchTerm: string) =>
    this.setState({
      searchTerm,
      trimmed: false,
    });

  toggleTrimmed = () =>
    this.setState((prevState) => ({
      searchTerm: "",
      trimmed: !prevState.trimmed,
    }));

  toggleMetricsAreExpanded = () =>
    this.setState((prevState) => ({
      metricsAreExpanded: !prevState.metricsAreExpanded,
    }));

  emptyList = () =>
    this.setState((prevState) => {
      prevState.selectedLangs.clear();
      return prevState;
    });

  resetList = () =>
    this.setState((prevState) => {
      // mark top 10 as selected
      prevState.selectedLangs.clear();

      for (let i = 0; i < 10; i++) {
        prevState.selectedLangs.add(this.state.langList[i].name);
      }

      return {
        ...prevState,
        searchTerm: "",
      };
    });

  changeMetric = (metric: keyof Metrics) =>
    this.setState({ metric }, this.constructList);

  changeScale = (scale: Scale) => this.setState({ scale });

  toggleSelected = (name: string) =>
    this.setState((prevState) => {
      if (prevState.selectedLangs.has(name)) {
        prevState.selectedLangs.delete(name);
      } else {
        prevState.selectedLangs.add(name);
      }
      return { selectedLangs: prevState.selectedLangs };
    });

  // if nothing is passed, remove highlight
  setHighlighted = (name?: string) => this.setState({ highlighed: name });

  render = () => (
    <GlobalContext.Provider
      value={{
        ...this.state,
        updateSearchTerm: this.updateSearchTerm,
        toggleTrimmed: this.toggleTrimmed,
        toggleMetricsAreExpanded: this.toggleMetricsAreExpanded,
        emptyList: this.emptyList,
        resetList: this.resetList,
        changeMetric: this.changeMetric,
        changeScale: this.changeScale,
        toggleSelected: this.toggleSelected,
        setHighlighted: this.setHighlighted,
      }}
    >
      {this.props.children}
    </GlobalContext.Provider>
  );

  private constructList() {
    const getRanks = (offset = 1) => {
      const counts = objectEntries(entries)
        .map(([name, stats]) => ({
          name,
          value: stats.slice(-offset)[0][this.state.metric],
        }))
        .sort((a, b) => b.value - a.value);

      let currRank: number;
      const ranks = counts.map(({ name, value }, i) => {
        let rank: number;

        // edge case for first element
        // if theres a tie, dont increment the rank
        if (i === 0) {
          rank = 1;
        } else if (counts[i - 1].value === value) {
          rank = currRank;
        } else {
          rank = currRank + 1;
        }
        currRank = rank;

        return {
          name,
          rank,
        };
      });

      return ranks;
    };

    const currentRanks = getRanks();
    const oldRanks = getRanks(5);
    const oldRanksMap: { [k: string]: number } = oldRanks.reduce(
      (prev, curr) => ({ ...prev, [curr.name]: curr.rank }),
      {}
    );

    const worstRank = Math.min(
      oldRanks[oldRanks.length - 1].rank,
      currentRanks[currentRanks.length - 1].rank
    );

    const langList = currentRanks.map((ele) => ({
      ...ele,
      color: colors[ele.name],
      diff:
        Math.min(oldRanksMap[ele.name], worstRank) -
        Math.min(ele.rank, worstRank),
    }));

    this.setState({ langList });
  }

  private loadUrlParams() {
    // do it only if theres any hash in uri
    if (!window.location.hash) return;

    const params = new URLSearchParams(window.location.hash.slice(1));

    // set the url's metric only if it exists
    const metric = params.get("y");
    if (metric) {
      this.changeMetric(metric as keyof Metrics);
    }
    const scale = params.get("yscale");
    if (scale) {
      this.changeScale(scale as Scale);
    }

    // set the names if they exist
    const names = new Set(params.get("names")?.split(","));
    if (names.size !== 0) {
      this.emptyList();
      // the search has to be done because the url stores the lower case version but the state requires the original name
      for (const lang of this.state.langList) {
        if (names.has(lang.name.toLowerCase())) {
          this.toggleSelected(lang.name);
        }
      }
    }

    // clean up the hash after done loading
    window.location.hash = "";

    this.setState({ trimmed: true });
  }
}
