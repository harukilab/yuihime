/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class PartialJsonFinalAnswerExtractor {
  private state: 'searching' | 'capturing' | 'ended' = 'searching';
  private buffer = "";
  private escaped = false;

  constructor(private onTextDelta: (delta: string) => void) {}

  feed(chunk: string) {
    if (this.state === 'ended') return;

    this.buffer += chunk;

    if (this.state === 'searching') {
      const match = this.buffer.match(/"(speech|final_answer|response)"\s*:\s*"/);
      if (!match) {
        if (this.buffer.length > 1000) {
          this.buffer = this.buffer.substring(this.buffer.length - 500);
        }
        return;
      }
      
      const matchIndex = this.buffer.indexOf(match[0]);
      this.state = 'capturing';
      this.buffer = this.buffer.substring(matchIndex + match[0].length);
    }

    if (this.state === 'capturing') {
      let delta = "";
      let i = 0;
      while (i < this.buffer.length) {
        const char = this.buffer[i];
        if (this.escaped) {
          this.escaped = false;
          if (char === 'n') delta += '\n';
          else if (char === 't') delta += '\t';
          else if (char === 'r') delta += '\r';
          else delta += char;
          i++;
          continue;
        }

        if (char === '\\') {
          this.escaped = true;
          i++;
          continue;
        }

        if (char === '"') {
          this.state = 'ended';
          this.buffer = "";
          break;
        }

        delta += char;
        i++;
      }

      if (delta.length > 0) {
        this.onTextDelta(delta);
      }
      this.buffer = this.buffer.substring(i);
    }
  }
}

export class StreamExtractor {
  private isRawText: boolean;
  private jsonExtractor: PartialJsonFinalAnswerExtractor;
  private directFeed: (chunk: string) => void;

  constructor(isRawText: boolean, onTextDelta: (delta: string) => void) {
    this.isRawText = isRawText;
    this.jsonExtractor = new PartialJsonFinalAnswerExtractor(onTextDelta);
    this.directFeed = onTextDelta;
  }

  feed(chunk: string) {
    if (this.isRawText) {
      this.directFeed(chunk);
    } else {
      this.jsonExtractor.feed(chunk);
    }
  }
}
