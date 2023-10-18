import { inject, injectable } from "tsyringe";
import { IPackageJsonData } from "../models/spt/mod/IPackageJsonData";
import { ILogger } from "../models/spt/utils/ILogger";
import { LocalisationService } from "../services/LocalisationService";

@injectable()
export class ModLoadOrder
{
    protected mods = new Map<string, IPackageJsonData>();
    protected modsAvailable = new Map<string, IPackageJsonData>();
    protected loadOrder = new Set<string>();

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("LocalisationService") protected localisationService: LocalisationService
    )
    { }

    public setModList(mods: Record<string, IPackageJsonData>): void
    {
        this.mods = new Map<string, IPackageJsonData>(Object.entries(mods));
        this.modsAvailable = structuredClone(this.mods);
        this.loadOrder = new Set<string>();

        const visited = new Set<string>();

        //invert loadBefore into loadAfter on specified mods
        for (const [ modName, modConfig ] of this.modsAvailable)
        {
            if ((modConfig.loadBefore ?? []).length > 0)
            {
                this.invertLoadBefore(modName);
            }
        }

        for (const modName of this.modsAvailable.keys())
        {
            this.getLoadOrderRecursive(modName, visited);
        }
    }

    public getLoadOrder(): string[]
    {
        return Array.from(this.loadOrder);
    }

    public getModsOnLoadBefore(mod: string): Set<string>
    {
        if (!this.mods.has(mod))
        {
            throw new Error(`Mod: ${mod} isn't present.`);
        }

        const config = this.mods.get(mod);

        const loadBefore = new Set<string>(config.loadBefore);

        for (const loadBeforeMod of loadBefore)
        {
            if (!this.mods.has(loadBeforeMod))
            {
                loadBefore.delete(loadBeforeMod);
            }
        }

        return loadBefore;
    }

    public getModsOnLoadAfter(mod: string): Set<string>
    {
        if (!this.mods.has(mod))
        {
            throw new Error(`Mod: ${mod} isn't present.`);
        }

        const config = this.mods.get(mod);

        const loadAfter = new Set<string>(config.loadAfter);

        for (const loadAfterMod of loadAfter)
        {
            if (!this.mods.has(loadAfterMod))
            {
                loadAfter.delete(loadAfterMod);
            }
        }

        return loadAfter;
    }

    protected invertLoadBefore(mod: string): void
    {
        const loadBefore = this.getModsOnLoadBefore(mod);

        for (const loadBeforeMod of loadBefore)
        {
            const loadBeforeModConfig = this.modsAvailable.get(loadBeforeMod)!;

            loadBeforeModConfig.loadAfter ??= [];
            loadBeforeModConfig.loadAfter.push(mod);

            this.modsAvailable.set(loadBeforeMod, loadBeforeModConfig);
        }
    }

    protected getLoadOrderRecursive(mod: string, visited: Set<string>): void
    {
        // validate package
        if (this.loadOrder.has(mod))
        {
            return;
        }

        if (visited.has(mod))
        {
            // front: white, back: red
            this.logger.error(this.localisationService.getText("modloader-cyclic_dependency"));

            // additional info
            this.logger.debug(this.localisationService.getText("modloader-checking_mod", mod));
            this.logger.debug(`${this.localisationService.getText("modloader-checked")}:`);
            this.logger.debug(JSON.stringify(this.loadOrder, null, "\t"));
            this.logger.debug(`${this.localisationService.getText("modloader-visited")}:`);
            this.logger.debug(JSON.stringify(visited, null, "\t"));

            // wait for input
            process.exit(1);
        }

        // check dependencies
        if (!this.modsAvailable.has(mod))
        {
            this.logger.error(this.localisationService.getText("modloader-missing_dependency"));
            throw new Error(this.localisationService.getText("modloader-error_parsing_mod_load_order"));
        }

        const config = this.modsAvailable.get(mod);

        config.loadAfter ??= [];
        config.modDependencies ??= {};

        const loadAfter = new Set<string>(Object.keys(config.modDependencies));

        for (const after of config.loadAfter)
        {
            if (this.modsAvailable.has(after))
            {
                loadAfter.add(after);
            }
        }

        visited.add(mod);

        for (const mod of loadAfter)
        {
            this.getLoadOrderRecursive(mod, visited);
        }

        visited.delete(mod);
        this.loadOrder.add(mod);
    }
}
