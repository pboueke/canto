export class File {
  uri: string;
  constructor(uri: string) {
    this.uri = uri;
  }
  text(): string {
    return '';
  }
}
