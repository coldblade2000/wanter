class Watch{
    name: string;
    url: string;
    triggers: Array<Trigger>;

    constructor(name: string, url: string, triggers: Array<Trigger>) {
        this.name = name;
        this.url = url;
        this.triggers = triggers;
    }
}