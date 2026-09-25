// Visual-novel style dialogue: a name tag, typewriter text and a voice blip per syllable.
const CHARS_PER_SECOND = 42;

export class Dialogue {
  constructor(sound) {
    this.sound = sound;
    this.box = document.getElementById("dialogue");
    this.nameEl = document.getElementById("dialogue-name");
    this.roleEl = document.getElementById("dialogue-role");
    this.textEl = document.getElementById("dialogue-text");
    this.prompt = document.getElementById("talk");
    this.member = null;
    this.queue = [];
    this.box.addEventListener("click", () => this.advance());
  }

  get open() {
    return this.member !== null;
  }

  // First chat plays the full introduction; later chats pick one line.
  start(member) {
    this.member = member;
    if (!member.heardAll) {
      this.queue = [...member.lines];
      member.heardAll = true;
    } else {
      this.queue = [member.repeat[Math.floor(Math.random() * member.repeat.length)]];
    }
    this.box.style.setProperty("--who", member.accent);
    this.nameEl.textContent = member.name;
    this.roleEl.textContent = member.role;
    this.box.hidden = false;
    this.prompt.hidden = true;
    this.next();
  }

  next() {
    const line = this.queue.shift();
    if (!line) return this.close();
    const c = this.member.character;
    this.line = line;
    this.shown = 0;
    this.textEl.textContent = "";
    this.box.classList.remove("done");
    c.expression = line.face ?? "neutral";
    if (line.emote) c.emote(line.emote);
    if (line.sparkle) {
      c.sparkle();
      this.sound.sparkle();
    }
  }

  // E, Enter or a click: finish the line if it's still typing, otherwise move on.
  advance() {
    if (!this.open) return;
    if (this.shown < this.line.text.length) {
      this.shown = this.line.text.length;
      this.textEl.textContent = this.line.text;
      return;
    }
    this.next();
  }

  close() {
    if (this.member) this.member.character.speaking = false;
    this.member = null;
    this.box.hidden = true;
  }

  setPrompt(member) {
    const show = member && !this.open;
    this.prompt.hidden = !show;
    if (show) this.prompt.querySelector("span").textContent = `Talk to ${member.name}`;
    this.promptMember = show ? member : null;
  }

  update(dt) {
    if (!this.open) return;
    if (this.member.dist > 6) return this.close();
    const c = this.member.character;
    const text = this.line.text;
    if (this.shown < text.length) {
      const before = Math.floor(this.shown);
      this.shown = Math.min(text.length, this.shown + dt * CHARS_PER_SECOND);
      const now = Math.floor(this.shown);
      for (let i = before; i < now; i++) {
        if (i % 2 === 0 && /[a-z0-9]/i.test(text[i])) this.sound.blip(this.member.voice);
      }
      this.textEl.textContent = text.slice(0, now);
      c.speaking = true;
    } else {
      c.speaking = false;
      this.box.classList.add("done");
    }
  }
}
