import PouchDB from "pouchdb" // TODO: Add a wrapper so we can remove `allowSyntheticDefaultImports`.
import { EventName, eventOrder, eventMetadata } from "./cubing"
import { Controller } from "./timer"
import { Milliseconds } from "./timer"
// import {ScrambleID} from "./scramble-worker"
import { Scramblers, ScrambleString } from "./cubing"
import { Stats } from "./stats"
import { Session, allDocsResponseToTimes } from "./results/session"
import { AttemptData } from "./results/attempt"

const favicons: { [s: string]: string } = {
  "blue": require("./lib/favicons/favicon_blue.ico"),
  "red": require("./lib/favicons/favicon_red.ico"),
  "green": require("./lib/favicons/favicon_green.ico"),
  "orange": require("./lib/favicons/favicon_orange.ico")
}

// TODO: Import this from "./scramble-worker"
export type ScrambleID = number;

const DEFAULT_EVENT = "333";
const STORED_EVENT_TIMEOUT_MS = 15 * 60 * 1000;

type Scramble = {
  eventName: EventName
  scrambleString: string
}

type FormattedStats = {
  "avg5": string
  "avg12": string
  "avg100": string
  "mean3": string
  "best": string
  "worst": string
  "numSolves": number
}

export class TimerApp {
  private scrambleView: ScrambleView;
  private statsView: StatsView;
  private domElement: HTMLElement;
  private currentEvent: EventName;
  private controller: Controller;
  private awaitedScrambleID: ScrambleID;
  private scramblers: Scramblers = new Scramblers();
  private currentScramble: Scramble;
  private session = new Session();
  private remoteDB: PouchDB.Database<AttemptData>;

  private cachedBest: number | null = null;
  private cachedWorst: number | null = null;
  constructor() {
    this.session.startSync(this.onSyncChange.bind(this));

    this.scrambleView = new ScrambleView(this);
    this.statsView = new StatsView();
    this.domElement = <HTMLElement>document.getElementById("timer-app");

    this.enableOffline();

    // // Prevent a timer tap from scrolling the whole page on touch screens.
    this.domElement.addEventListener("touchmove", function (event) {
      event.preventDefault();
    });

    this.controller = new Controller(
      <HTMLElement>document.getElementById("timer"),
      this.solveDone.bind(this),
      this.attemptDone.bind(this));
    this.setRandomThemeColor();

    this.updateDisplayStats();
    // // This should trigger a new attempt for us.
    this.setInitialEvent();

    // importTimes(this.session);
  }

  async onSyncChange(change: PouchDB.Replication.SyncResult<AttemptData>): Promise<void> {
    console.log("sync change", change);
    // TODO: Calculate if the only changes were at the end.
    this.updateDisplayStats(true);
    this.domElement.querySelector(".stats a")!.classList.add("rotate");
    setTimeout(() => {
      this.domElement.querySelector(".stats a")!.classList.remove("rotate");
    }, 500);

    // this.domElement.querySelector(".stats")!.classList.add("received-data");
    // setTimeout(() => {
    //   this.domElement.querySelector(".stats")!.classList.remove("received-data");
    // }, 750);
  }

  private async getTimes(): Promise<Milliseconds[]> {
    const docs = (await this.session.db.allDocs({
      // descending: true,
      include_docs: true
    }))
    return allDocsResponseToTimes(docs);
  }

  private enableOffline() {
    const infoBar = document.getElementById("update-bar");

    // TODO
    // if ("serviceWorker" in navigator) {
    //   navigator.serviceWorker.getRegistration().then(function(r) {
    //     console.log(r);
    //     if (!r) {
    //       navigator.serviceWorker.register("./service-worker.js").then(function(registration) {
    //         console.log("Registered service worker with scope: ", registration.scope);
    //       }, function(err) {
    //         console.error(err);
    //       });
    //     } else {
    //       console.log("Service worker already registered.");
    //     }
    //   }, function(err) {
    //     console.error("Could not enable offline support.");
    //   });
    // }
  }

  private setInitialEvent() {
    var storedEvent = localStorage.getItem("current-event");
    var lastAttemptDateStr = localStorage.getItem("last-attempt-date");

    var currentDate = new Date();

    if (storedEvent && storedEvent in eventMetadata &&
      lastAttemptDateStr &&
      (currentDate.getTime() - new Date(lastAttemptDateStr).getTime() < STORED_EVENT_TIMEOUT_MS)
    ) {
      this.setEvent(storedEvent, false);
    } else {
      this.setEvent(DEFAULT_EVENT, false);
    }
  }

  private scrambleCallback(eventName: EventName, scrambledId: ScrambleID, scramble: ScrambleString) {
    if (scrambledId === this.awaitedScrambleID) {
      this.currentScramble = { eventName: eventName, scrambleString: scramble };
      this.scrambleView.setScramble(this.currentScramble);
    } else {
      var logInfo = console.info ? console.info.bind(console) : console.log;
      logInfo("Scramble came back out of order late (received: ", scrambledId, ", current expected: ", this.awaitedScrambleID, "):", scramble)
    }
  }

  private startNewAttempt() {
    this.awaitedScrambleID = (typeof this.awaitedScrambleID !== "undefined") ? this.awaitedScrambleID + 1 : 0;

    this.scrambleView.clearScramble();
    this.scramblers.getRandomScramble(this.currentEvent, this.scrambleCallback.bind(this, this.currentEvent, this.awaitedScrambleID));
  }

  setEvent(eventName: EventName, restartShortTermSession: boolean) {
    localStorage.setItem("current-event", eventName);
    this.currentEvent = eventName;
    this.scrambleView.setEvent(this.currentEvent);
    this.startNewAttempt();
    this.controller.reset();
    if (restartShortTermSession) {
      console.log("Restart not implemented");
      // this.updateDisplayStats([]);
    }
  }

  private setRandomThemeColor() {
    type ThemeColor = {
      name: string
      value: string
    }
    var themeColors = [
      { name: "orange", value: "#f95b2a" },
      { name: "green", value: "#0d904f" },
      { name: "red", value: "#ce2e20" },
      { name: "blue", value: "#4285f4" }
    ];
    var randomChoice = Util.randomChoice<ThemeColor>(themeColors);
    this.domElement.classList.add("theme-" + randomChoice.name);

    // TODO: Can we remove the following line safely?
    const head = document.head || document.getElementsByTagName('head')[0];

    var favicon = document.createElement('link');
    var currentFavicon = document.getElementById('favicon');
    favicon.id = 'favicon';
    favicon.rel = 'shortcut icon';
    favicon.href = favicons[randomChoice.name];
    if (currentFavicon) {
      head.removeChild(currentFavicon);
    }
    head.appendChild(favicon);

    var meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.id = "theme-color";
    meta.content = randomChoice.value;
    head.appendChild(meta);
  }

  private async solveDone(time: Milliseconds): Promise<void> {
    await this.persistResult(time);
    await this.updateDisplayStats(true);
  }

  //   /**
  //    * @param {!TimerApp.Timer.Milliseconds} time
  //    */
  private async persistResult(time: Milliseconds): Promise<void> {
    await this.session.addNewAttempt({
      totalResultMs: time,
      unixDate: Date.now(),
      event: this.currentEvent,
      scramble: (this.currentScramble || { scrambleString: "" }).scrambleString
    })
  }

  async updateDisplayStats(assumeAttemptAppended: boolean = false) {
    if (assumeAttemptAppended) {
      const times = allDocsResponseToTimes(await this.session.mostRecentAttempts(100)).reverse();

      const timesForBestAndWorst = times.slice(0);
      if (this.cachedBest !== null) {
        timesForBestAndWorst.push(this.cachedBest)
      }
      if (this.cachedWorst !== null) {
        timesForBestAndWorst.push(this.cachedWorst)
      }

      if (timesForBestAndWorst.length > 0) {
        this.cachedBest = Math.min(...timesForBestAndWorst);
        this.cachedWorst = Math.max(...timesForBestAndWorst);
      }

      this.statsView.setStats({
        "avg5": Stats.formatTime(Stats.trimmedAverage(Stats.lastN(times, 5))),
        "avg12": Stats.formatTime(Stats.trimmedAverage(Stats.lastN(times, 12))),
        "avg100": Stats.formatTime(Stats.trimmedAverage(Stats.lastN(times, 100))),
        "mean3": Stats.formatTime(Stats.mean(Stats.lastN(times, 3))),
        "best": Stats.formatTime(this.cachedBest === Infinity ? null : this.cachedBest),
        "worst": Stats.formatTime(this.cachedWorst === Infinity ? null : this.cachedWorst),
        "numSolves": (await this.session.db.info()).doc_count - 1 // TODO: exact number
      });
    } else {
      const times: Milliseconds[] = await this.getTimes();
      const best = Stats.best(times);
      if (best !== null) {
        this.cachedBest = best;
      }
      const worst = Stats.worst(times);
      if (worst !== null) {
        this.cachedWorst = worst;
      }

      this.statsView.setStats({
        "avg5": Stats.formatTime(Stats.trimmedAverage(Stats.lastN(times, 5))),
        "avg12": Stats.formatTime(Stats.trimmedAverage(Stats.lastN(times, 12))),
        "avg100": Stats.formatTime(Stats.trimmedAverage(Stats.lastN(times, 100))),
        "mean3": Stats.formatTime(Stats.mean(Stats.lastN(times, 3))),
        "best": Stats.formatTime(this.cachedBest),
        "worst": Stats.formatTime(this.cachedWorst),
        "numSolves": times.length
      });
    }
  }

  private attemptDone(): void {
    this.startNewAttempt();
  }
}

class ScrambleView {
  private scrambleElement: HTMLElement;
  private eventSelectDropdown: HTMLSelectElement;
  private cubingIcon: HTMLElement;
  private scrambleText: HTMLElement;
  private optionElementsByEventName: { [s: string]: HTMLOptionElement };
  constructor(private timerApp: TimerApp) {
    this.scrambleElement = <HTMLElement>document.getElementById("scramble-bar");
    this.eventSelectDropdown = <HTMLSelectElement>document.getElementById("event-select-dropdown");
    this.cubingIcon = <HTMLElement>document.getElementById("cubing-icon");
    this.scrambleText = <HTMLAnchorElement>document.getElementById("scramble-text");

    this.eventSelectDropdown.addEventListener("change", () => {
      this.eventSelectDropdown.blur()
      this.timerApp.setEvent(this.eventSelectDropdown.value, true);
    });

    this.initializeSelectDropdown();
  }

  initializeSelectDropdown() {
    this.optionElementsByEventName = {};
    for (var eventName of eventOrder) {
      var optionElement = document.createElement("option");
      optionElement.value = eventName;
      optionElement.textContent = eventMetadata[eventName].name;

      this.optionElementsByEventName[eventName] = optionElement;
      this.eventSelectDropdown.appendChild(optionElement);
    }
  }

  setEvent(eventName: string) {
    Util.removeClassesStartingWith(this.scrambleText, "event-");
    this.scrambleText.classList.add("event-" + eventName);
    Util.removeClassesStartingWith(this.cubingIcon, "icon-");
    this.cubingIcon.classList.add("icon-" + eventName);
    if (this.eventSelectDropdown.value !== eventName) {
      this.optionElementsByEventName[eventName].selected = true;
    }
    this.setScramblePlaceholder(eventName);
  }

  setScramblePlaceholder(eventName: EventName) {
    this.setScramble({
      eventName: eventName,
      scrambleString: "generating..."
    });
  }

  setScramble(scramble: Scramble) {
    this.scrambleText.classList.remove("stale");
    this.scrambleText.textContent = scramble.scrambleString;

    // TODO(lgarron): Use proper layout code. https://github.com/cubing/timer/issues/20
    if (scramble.eventName === "minx") {
      this.scrambleText.innerHTML = scramble.scrambleString;
    }
    else if (scramble.eventName === "sq1") {
      this.scrambleText.innerHTML = scramble.scrambleString.replace(/, /g, ",&nbsp;").replace(/\) \//g, ")&nbsp;/");
    }
  }

  clearScramble() {
    // this.scrambleText.href = ""; // TODO
    this.scrambleText.classList.add("stale");
  }
}

class StatsView {
  private statsDropdown: HTMLSelectElement;
  private elems: { [s: string]: HTMLOptionElement };
  constructor() {
    this.statsDropdown = <HTMLSelectElement>document.getElementById("stats-dropdown");
    this.elems = {
      "avg5": <HTMLOptionElement>document.getElementById("avg5"),
      "avg12": <HTMLOptionElement>document.getElementById("avg12"),
      "avg100": <HTMLOptionElement>document.getElementById("avg100"),
      "mean3": <HTMLOptionElement>document.getElementById("mean3"),
      "best": <HTMLOptionElement>document.getElementById("best"),
      "worst": <HTMLOptionElement>document.getElementById("worst"),
      "num-solves": <HTMLOptionElement>document.getElementById("num-solves"),
    };

    this.initializeDropdown();

    const syncLink = <HTMLAnchorElement>document.querySelector("#sync-link");
    syncLink.addEventListener("click", (e: Event) => {
      e.preventDefault();
      window.location.href = syncLink.href;
    });
    const resultLink = <HTMLAnchorElement>document.querySelector("#results-link");
    resultLink.addEventListener("click", (e: Event) => {
      e.preventDefault();
      window.location.href = resultLink.href;
    });
  }

  initializeDropdown() {
    var storedCurrentStat = localStorage.getItem("current-stat");

    if (storedCurrentStat && storedCurrentStat in this.elems) {
      this.elems[storedCurrentStat].selected = true;
    }

    this.statsDropdown.addEventListener("change", function () {
      localStorage.setItem("current-stat", this.statsDropdown.value);
      this.statsDropdown.blur();
    }.bind(this));
  }

  setStats(stats: FormattedStats) {
    this.elems["avg5"].textContent = "avg5: " + stats.avg5;
    this.elems["avg12"].textContent = "avg12: " + stats.avg12;
    this.elems["avg100"].textContent = "avg100: " + stats.avg100;
    this.elems["mean3"].textContent = "mean3: " + stats.mean3;
    this.elems["best"].textContent = "best: " + stats.best;
    this.elems["worst"].textContent = "worst: " + stats.worst;
    this.elems["num-solves"].textContent = "#solves: " + stats.numSolves;
  }
}

class Util {
  static removeClassesStartingWith(element: HTMLElement, prefix: string): void {
    var classes = Array.prototype.slice.call(element.classList);
    for (var i in classes) {
      var className = classes[i];
      if (className.startsWith(prefix)) {
        element.classList.remove(className);
      }
    }
  }

  static randomChoice<T>(list: T[]): T {
    return list[Math.floor(Math.random() * list.length)];
  }
}
