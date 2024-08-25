import { ScavCaseRewardGenerator } from "@spt/generators/ScavCaseRewardGenerator";
import { HideoutHelper } from "@spt/helpers/HideoutHelper";
import { InventoryHelper } from "@spt/helpers/InventoryHelper";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { PaymentHelper } from "@spt/helpers/PaymentHelper";
import { PresetHelper } from "@spt/helpers/PresetHelper";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { HideoutArea, ITaskConditionCounter, Product, ScavCase } from "@spt/models/eft/common/tables/IBotBase";
import { Item } from "@spt/models/eft/common/tables/IItem";
import { HideoutUpgradeCompleteRequestData } from "@spt/models/eft/hideout/HideoutUpgradeCompleteRequestData";
import { IHandleQTEEventRequestData } from "@spt/models/eft/hideout/IHandleQTEEventRequestData";
import { IHideoutArea, IStageRequirement, Stage } from "@spt/models/eft/hideout/IHideoutArea";
import { IHideoutCancelProductionRequestData } from "@spt/models/eft/hideout/IHideoutCancelProductionRequestData";
import { IHideoutCircleOfCultistProductionStartRequestData } from "@spt/models/eft/hideout/IHideoutCircleOfCultistProductionStartRequestData";
import { IHideoutContinuousProductionStartRequestData } from "@spt/models/eft/hideout/IHideoutContinuousProductionStartRequestData";
import { IHideoutDeleteProductionRequestData } from "@spt/models/eft/hideout/IHideoutDeleteProductionRequestData";
import { IHideoutImproveAreaRequestData } from "@spt/models/eft/hideout/IHideoutImproveAreaRequestData";
import { IHideoutProduction, Requirement } from "@spt/models/eft/hideout/IHideoutProduction";
import { IHideoutPutItemInRequestData } from "@spt/models/eft/hideout/IHideoutPutItemInRequestData";
import { IHideoutScavCaseStartRequestData } from "@spt/models/eft/hideout/IHideoutScavCaseStartRequestData";
import { IHideoutSingleProductionStartRequestData } from "@spt/models/eft/hideout/IHideoutSingleProductionStartRequestData";
import { IHideoutTakeItemOutRequestData } from "@spt/models/eft/hideout/IHideoutTakeItemOutRequestData";
import { IHideoutTakeProductionRequestData } from "@spt/models/eft/hideout/IHideoutTakeProductionRequestData";
import { IHideoutToggleAreaRequestData } from "@spt/models/eft/hideout/IHideoutToggleAreaRequestData";
import { IHideoutUpgradeRequestData } from "@spt/models/eft/hideout/IHideoutUpgradeRequestData";
import { IQteData } from "@spt/models/eft/hideout/IQteData";
import { IRecordShootingRangePoints } from "@spt/models/eft/hideout/IRecordShootingRangePoints";
import { IAddItemDirectRequest } from "@spt/models/eft/inventory/IAddItemDirectRequest";
import { IAddItemsDirectRequest } from "@spt/models/eft/inventory/IAddItemsDirectRequest";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { BackendErrorCodes } from "@spt/models/enums/BackendErrorCodes";
import { BonusType } from "@spt/models/enums/BonusType";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { HideoutAreas } from "@spt/models/enums/HideoutAreas";
import { ItemTpl } from "@spt/models/enums/ItemTpl";
import { SkillTypes } from "@spt/models/enums/SkillTypes";
import { IHideoutConfig } from "@spt/models/spt/config/IHideoutConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt/routers/EventOutputHolder";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { FenceService } from "@spt/services/FenceService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { PlayerService } from "@spt/services/PlayerService";
import { ProfileActivityService } from "@spt/services/ProfileActivityService";
import { HashUtil } from "@spt/utils/HashUtil";
import { HttpResponseUtil } from "@spt/utils/HttpResponseUtil";
import { RandomUtil } from "@spt/utils/RandomUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class HideoutController {
    /** Key used in TaskConditionCounters array */
    protected static nameTaskConditionCountersCrafting = "CounterHoursCrafting";
    protected hideoutConfig: IHideoutConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("InventoryHelper") protected inventoryHelper: InventoryHelper,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("PlayerService") protected playerService: PlayerService,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("PaymentHelper") protected paymentHelper: PaymentHelper,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("HideoutHelper") protected hideoutHelper: HideoutHelper,
        @inject("ScavCaseRewardGenerator") protected scavCaseRewardGenerator: ScavCaseRewardGenerator,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ProfileActivityService") protected profileActivityService: ProfileActivityService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("FenceService") protected fenceService: FenceService,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.hideoutConfig = this.configServer.getConfig(ConfigTypes.HIDEOUT);
    }

    /**
     * Handle HideoutUpgrade event
     * Start a hideout area upgrade
     * @param pmcData Player profile
     * @param request upgrade start request
     * @param sessionID Session id
     * @param output Client response
     */
    public startUpgrade(
        pmcData: IPmcData,
        request: IHideoutUpgradeRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): void {
        const items = request.items.map((reqItem) => {
            const item = pmcData.Inventory.items.find((invItem) => invItem._id === reqItem.id);
            return { inventoryItem: item, requestedItem: reqItem };
        });

        // If it's not money, its construction / barter items
        for (const item of items) {
            if (!item.inventoryItem) {
                this.logger.error(
                    this.localisationService.getText("hideout-unable_to_find_item_in_inventory", item.requestedItem.id),
                );
                this.httpResponse.appendErrorToOutput(output);

                return;
            }

            if (
                this.paymentHelper.isMoneyTpl(item.inventoryItem._tpl) &&
                item.inventoryItem.upd &&
                item.inventoryItem.upd.StackObjectsCount &&
                item.inventoryItem.upd.StackObjectsCount > item.requestedItem.count
            ) {
                item.inventoryItem.upd.StackObjectsCount -= item.requestedItem.count;
            } else {
                this.inventoryHelper.removeItem(pmcData, item.inventoryItem._id, sessionID, output);
            }
        }

        // Construction time management
        const profileHideoutArea = pmcData.Hideout.Areas.find((area) => area.type === request.areaType);
        if (!profileHideoutArea) {
            this.logger.error(this.localisationService.getText("hideout-unable_to_find_area", request.areaType));
            this.httpResponse.appendErrorToOutput(output);

            return;
        }

        const hideoutDataDb = this.databaseService
            .getTables()
            .hideout.areas.find((area) => area.type === request.areaType);
        if (!hideoutDataDb) {
            this.logger.error(
                this.localisationService.getText("hideout-unable_to_find_area_in_database", request.areaType),
            );
            this.httpResponse.appendErrorToOutput(output);

            return;
        }

        let ctime = hideoutDataDb.stages[profileHideoutArea.level + 1].constructionTime;
        if (ctime > 0) {
            if (this.profileHelper.isDeveloperAccount(sessionID)) {
                ctime = 40;
            }
            const timestamp = this.timeUtil.getTimestamp();

            profileHideoutArea.completeTime = Math.round(timestamp + ctime);
            profileHideoutArea.constructing = true;
        }
    }

    /**
     * Handle HideoutUpgradeComplete event
     * Complete a hideout area upgrade
     * @param pmcData Player profile
     * @param request Completed upgrade request
     * @param sessionID Session id
     * @param output Client response
     */
    public upgradeComplete(
        pmcData: IPmcData,
        request: HideoutUpgradeCompleteRequestData,
        sessionID: string,
        output: IItemEventRouterResponse,
    ): void {
        const hideout = this.databaseService.getHideout();
        const globals = this.databaseService.getGlobals();

        const profileHideoutArea = pmcData.Hideout.Areas.find((area) => area.type === request.areaType);
        if (!profileHideoutArea) {
            this.logger.error(this.localisationService.getText("hideout-unable_to_find_area", request.areaType));
            this.httpResponse.appendErrorToOutput(output);

            return;
        }

        // Upgrade profile values
        profileHideoutArea.level++;
        profileHideoutArea.completeTime = 0;
        profileHideoutArea.constructing = false;

        const hideoutData = hideout.areas.find((area) => area.type === profileHideoutArea.type);
        if (!hideoutData) {
            this.logger.error(
                this.localisationService.getText("hideout-unable_to_find_area_in_database", request.areaType),
            );
            this.httpResponse.appendErrorToOutput(output);

            return;
        }

        // Apply bonuses
        const hideoutStage = hideoutData.stages[profileHideoutArea.level];
        const bonuses = hideoutStage.bonuses;
        if (bonuses?.length > 0) {
            for (const bonus of bonuses) {
                this.hideoutHelper.applyPlayerUpgradesBonuses(pmcData, bonus);
            }
        }

        // Upgrade includes a container improvement/addition
        if (hideoutStage?.container) {
            this.addContainerImprovementToProfile(
                output,
                sessionID,
                pmcData,
                profileHideoutArea,
                hideoutData,
                hideoutStage,
            );
        }

        // Upgrading water collector / med station
        if (
            profileHideoutArea.type === HideoutAreas.WATER_COLLECTOR ||
            profileHideoutArea.type === HideoutAreas.MEDSTATION
        ) {
            this.checkAndUpgradeWall(pmcData);
        }

        // Cleanup temporary fuel usage buffs from mopping floor if wall is complete as it would result in too many bonuses
        // TODO: Clean up all buffs from mopping floor.
        if (profileHideoutArea.type === HideoutAreas.EMERGENCY_WALL && profileHideoutArea.level === 6) {
            // Get everything except specific fuel consumption buffs
            pmcData.Bonuses = pmcData.Bonuses.filter(
                (bonus) => bonus.type !== BonusType.FUEL_CONSUMPTION && bonus.value >= -10 && bonus.value <= 0,
            );
        }

        // Add Skill Points Per Area Upgrade
        this.profileHelper.addSkillPointsToPlayer(
            pmcData,
            SkillTypes.HIDEOUT_MANAGEMENT,
            globals.config.SkillsSettings.HideoutManagement.SkillPointsPerAreaUpgrade,
        );
    }

    /**
     * Upgrade wall status to visible in profile if medstation/water collector are both level 1
     * @param pmcData Player profile
     */
    protected checkAndUpgradeWall(pmcData: IPmcData): void {
        const medStation = pmcData.Hideout.Areas.find((area) => area.type === HideoutAreas.MEDSTATION);
        const waterCollector = pmcData.Hideout.Areas.find((area) => area.type === HideoutAreas.WATER_COLLECTOR);
        if (medStation?.level >= 1 && waterCollector?.level >= 1) {
            const wall = pmcData.Hideout.Areas.find((area) => area.type === HideoutAreas.EMERGENCY_WALL);
            if (wall?.level === 0) {
                wall.level = 3;
            }
        }
    }

    /**
     * @param pmcData Profile to edit
     * @param output Object to send back to client
     * @param sessionID Session/player id
     * @param profileParentHideoutArea Current hideout area for profile
     * @param dbHideoutArea Hideout area being upgraded
     * @param hideoutStage Stage hideout area is being upgraded to
     */
    protected addContainerImprovementToProfile(
        output: IItemEventRouterResponse,
        sessionID: string,
        pmcData: IPmcData,
        profileParentHideoutArea: HideoutArea,
        dbHideoutArea: IHideoutArea,
        hideoutStage: Stage,
    ): void {
        // Add key/value to `hideoutAreaStashes` dictionary - used to link hideout area to inventory stash by its id
        if (!pmcData.Inventory.hideoutAreaStashes[dbHideoutArea.type]) {
            pmcData.Inventory.hideoutAreaStashes[dbHideoutArea.type] = dbHideoutArea._id;
        }

        // Add/upgrade stash item in player inventory
        this.addUpdateInventoryItemToProfile(sessionID, pmcData, dbHideoutArea, hideoutStage);

        // Edge case, add/update `stand1/stand2/stand3` children
        if (dbHideoutArea.type === HideoutAreas.EQUIPMENT_PRESETS_STAND) {
            // Can have multiple 'standx' children depending on upgrade level
            this.addMissingPresetStandItemsToProfile(sessionID, hideoutStage, pmcData, dbHideoutArea, output);
        }

        // Dont inform client when upgraded area is hall of fame, BSG doesn't inform client this specifc upgrade has occurred
        // will break client if sent
        if (![HideoutAreas.PLACE_OF_FAME].includes(dbHideoutArea.type)) {
            this.addContainerUpgradeToClientOutput(sessionID, dbHideoutArea.type, dbHideoutArea, hideoutStage, output);
        }

        //TODO - surround with if check to only run when working with HideoutAreas.WEAPON_STAND
        // The Gun stand has a child area linked to it, it needs to also be added
        const childDbArea = this.databaseService
            .getHideout()
            .areas.find((area) => area.parentArea === dbHideoutArea._id);
        if (childDbArea) {
            // Add key/value to `hideoutAreaStashes` dictionary - used to link hideout area to inventory stash by its id
            if (!pmcData.Inventory.hideoutAreaStashes[childDbArea.type]) {
                pmcData.Inventory.hideoutAreaStashes[childDbArea.type] = childDbArea._id;
            }

            // Set child area level to same as parent area
            pmcData.Hideout.Areas.find((hideoutArea) => hideoutArea.type === childDbArea.type).level =
                pmcData.Hideout.Areas.find((x) => x.type === profileParentHideoutArea.type).level;

            // Add/upgrade stash item in player inventory
            const childDbAreaStage = childDbArea.stages[profileParentHideoutArea.level];
            this.addUpdateInventoryItemToProfile(sessionID, pmcData, childDbArea, childDbAreaStage);

            // Inform client of the changes
            this.addContainerUpgradeToClientOutput(sessionID, childDbArea.type, childDbArea, childDbAreaStage, output);
        }
    }

    /**
     * Add stand1/stand2/stand3 inventory items to profile, depending on passed in hideout stage
     * @param sessionId Session id
     * @param equipmentPresetStage Current EQUIPMENT_PRESETS_STAND stage data
     * @param pmcData Player profile
     * @param equipmentPresetHideoutArea
     * @param output Response to send back to client
     */
    protected addMissingPresetStandItemsToProfile(
        sessionId: string,
        equipmentPresetStage: Stage,
        pmcData: IPmcData,
        equipmentPresetHideoutArea: IHideoutArea,
        output: IItemEventRouterResponse,
    ) {
        // Each slot is a single Mannequin
        const slots = this.itemHelper.getItem(equipmentPresetStage.container)[1]._props.Slots;
        for (const mannequinSlot of slots) {
            // Chek if we've already added this manniquin
            const existingMannequin = pmcData.Inventory.items.find(
                (item) => item.parentId === equipmentPresetHideoutArea._id && item.slotId === mannequinSlot._name,
            );

            // No child, add it
            if (!existingMannequin) {
                const mannequinToAdd = {
                    _id: this.hashUtil.generate(),
                    _tpl: ItemTpl.INVENTORY_DEFAULT,
                    parentId: equipmentPresetHideoutArea._id,
                    slotId: mannequinSlot._name,
                };
                pmcData.Inventory.items.push(mannequinToAdd);

                // Inform client of new item being added to inventory
                output.profileChanges[sessionId].items.new.push(mannequinToAdd);
            }
        }
    }

    /**
     * Add an inventory item to profile from a hideout area stage data
     * @param pmcData Profile to update
     * @param dbHideoutArea Hideout area from db being upgraded
     * @param hideoutStage Stage area upgraded to
     */
    protected addUpdateInventoryItemToProfile(
        sessionId: string,
        pmcData: IPmcData,
        dbHideoutArea: IHideoutArea,
        hideoutStage: Stage,
    ): void {
        const existingInventoryItem = pmcData.Inventory.items.find((item) => item._id === dbHideoutArea._id);
        if (existingInventoryItem) {
            // Update existing items container tpl to point to new id (tpl)
            existingInventoryItem._tpl = hideoutStage.container;

            return;
        }

        // Add new item as none exists (don't inform client of newContainerItem, will be done in `profileChanges.changedHideoutStashes`)
        const newContainerItem = { _id: dbHideoutArea._id, _tpl: hideoutStage.container };
        pmcData.Inventory.items.push(newContainerItem);
    }

    /**
     * @param output Object to send to client
     * @param sessionID Session/player id
     * @param areaType Hideout area that had stash added
     * @param hideoutDbData Hideout area that caused addition of stash
     * @param hideoutStage Hideout area upgraded to this
     */
    protected addContainerUpgradeToClientOutput(
        sessionID: string,
        areaType: HideoutAreas,
        hideoutDbData: IHideoutArea,
        hideoutStage: Stage,
        output: IItemEventRouterResponse,
    ): void {
        if (!output.profileChanges[sessionID].changedHideoutStashes) {
            output.profileChanges[sessionID].changedHideoutStashes = {};
        }

        // Inform client of changes
        output.profileChanges[sessionID].changedHideoutStashes[areaType] = {
            Id: hideoutDbData._id,
            Tpl: hideoutStage.container,
        };
    }

    /**
     * Handle HideoutPutItemsInAreaSlots
     * Create item in hideout slot item array, remove item from player inventory
     * @param pmcData Profile data
     * @param addItemToHideoutRequest reqeust from client to place item in area slot
     * @param sessionID Session id
     * @returns IItemEventRouterResponse object
     */
    public putItemsInAreaSlots(
        pmcData: IPmcData,
        addItemToHideoutRequest: IHideoutPutItemInRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionID);

        const itemsToAdd = Object.entries(addItemToHideoutRequest.items).map((kvp) => {
            const item = pmcData.Inventory.items.find((invItem) => invItem._id === kvp[1].id);
            return { inventoryItem: item, requestedItem: kvp[1], slot: kvp[0] };
        });

        const hideoutArea = pmcData.Hideout.Areas.find((area) => area.type === addItemToHideoutRequest.areaType);
        if (!hideoutArea) {
            this.logger.error(
                this.localisationService.getText(
                    "hideout-unable_to_find_area_in_database",
                    addItemToHideoutRequest.areaType,
                ),
            );
            return this.httpResponse.appendErrorToOutput(output);
        }

        for (const item of itemsToAdd) {
            if (!item.inventoryItem) {
                this.logger.error(
                    this.localisationService.getText("hideout-unable_to_find_item_in_inventory", {
                        itemId: item.requestedItem.id,
                        area: hideoutArea.type,
                    }),
                );
                return this.httpResponse.appendErrorToOutput(output);
            }

            // Add item to area.slots
            const destinationLocationIndex = Number(item.slot);
            const hideoutSlotIndex = hideoutArea.slots.findIndex(
                (slot) => slot.locationIndex === destinationLocationIndex,
            );
            if (hideoutSlotIndex === -1) {
                this.logger.error(
                    `Unable to put item: ${item.requestedItem.id} into slot as slot cannot be found for area: ${addItemToHideoutRequest.areaType}, skipping`,
                );
                continue;
            }

            hideoutArea.slots[hideoutSlotIndex].item = [
                {
                    _id: item.inventoryItem._id,
                    _tpl: item.inventoryItem._tpl,
                    upd: item.inventoryItem.upd,
                },
            ];

            this.inventoryHelper.removeItem(pmcData, item.inventoryItem._id, sessionID, output);
        }

        // Trigger a forced update
        this.hideoutHelper.updatePlayerHideout(sessionID);

        return output;
    }

    /**
     * Handle HideoutTakeItemsFromAreaSlots event
     * Remove item from hideout area and place into player inventory
     * @param pmcData Player profile
     * @param request Take item out of area request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public takeItemsFromAreaSlots(
        pmcData: IPmcData,
        request: IHideoutTakeItemOutRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionID);

        const hideoutArea = pmcData.Hideout.Areas.find((area) => area.type === request.areaType);
        if (!hideoutArea) {
            this.logger.error(this.localisationService.getText("hideout-unable_to_find_area", request.areaType));
            return this.httpResponse.appendErrorToOutput(output);
        }

        if (!hideoutArea.slots || hideoutArea.slots.length === 0) {
            this.logger.error(
                this.localisationService.getText("hideout-unable_to_find_item_to_remove_from_area", hideoutArea.type),
            );
            return this.httpResponse.appendErrorToOutput(output);
        }

        // Handle areas that have resources that can be placed in/taken out of slots from the area
        if (
            [
                HideoutAreas.AIR_FILTERING,
                HideoutAreas.WATER_COLLECTOR,
                HideoutAreas.GENERATOR,
                HideoutAreas.BITCOIN_FARM,
            ].includes(hideoutArea.type)
        ) {
            const response = this.removeResourceFromArea(sessionID, pmcData, request, output, hideoutArea);

            // Force a refresh of productions/hideout areas with resources
            this.hideoutHelper.updatePlayerHideout(sessionID);
            return response;
        }

        throw new Error(
            this.localisationService.getText("hideout-unhandled_remove_item_from_area_request", hideoutArea.type),
        );
    }

    /**
     * Find resource item in hideout area, add copy to player inventory, remove Item from hideout slot
     * @param sessionID Session id
     * @param pmcData Profile to update
     * @param removeResourceRequest client request
     * @param output response to send to client
     * @param hideoutArea Area fuel is being removed from
     * @returns IItemEventRouterResponse response
     */
    protected removeResourceFromArea(
        sessionID: string,
        pmcData: IPmcData,
        removeResourceRequest: IHideoutTakeItemOutRequestData,
        output: IItemEventRouterResponse,
        hideoutArea: HideoutArea,
    ): IItemEventRouterResponse {
        const slotIndexToRemove = removeResourceRequest.slots[0];

        // Assume only one item in slot
        const itemToReturn = hideoutArea.slots.find((slot) => slot.locationIndex === slotIndexToRemove).item[0];

        const request: IAddItemDirectRequest = {
            itemWithModsToAdd: [itemToReturn],
            foundInRaid: !!itemToReturn.upd?.SpawnedInSession,
            callback: undefined,
            useSortingTable: false,
        };

        this.inventoryHelper.addItemToStash(sessionID, request, pmcData, output);
        if (output.warnings && output.warnings.length > 0) {
            // Adding to stash failed, drop out - dont remove item from hideout area slot
            return output;
        }

        // Remove items from slot, locationIndex remains
        const hideoutSlotIndex = hideoutArea.slots.findIndex((slot) => slot.locationIndex === slotIndexToRemove);
        hideoutArea.slots[hideoutSlotIndex].item = undefined;

        return output;
    }

    /**
     * Handle HideoutToggleArea event
     * Toggle area on/off
     * @param pmcData Player profile
     * @param request Toggle area request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public toggleArea(
        pmcData: IPmcData,
        request: IHideoutToggleAreaRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionID);

        // Force a production update (occur before area is toggled as it could be generator and doing it after generator enabled would cause incorrect calculaton of production progress)
        this.hideoutHelper.updatePlayerHideout(sessionID);

        const hideoutArea = pmcData.Hideout.Areas.find((area) => area.type === request.areaType);
        if (!hideoutArea) {
            this.logger.error(this.localisationService.getText("hideout-unable_to_find_area", request.areaType));
            return this.httpResponse.appendErrorToOutput(output);
        }

        hideoutArea.active = request.enabled;

        return output;
    }

    /**
     * Handle HideoutSingleProductionStart event
     * Start production for an item from hideout area
     * @param pmcData Player profile
     * @param body Start prodution of single item request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public singleProductionStart(
        pmcData: IPmcData,
        body: IHideoutSingleProductionStartRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        // Start production
        this.hideoutHelper.registerProduction(pmcData, body, sessionID);

        // Find the recipe of the production
        const recipe = this.databaseService
            .getHideout()
            .production.recipes.find((production) => production._id === body.recipeId);

        // Find the actual amount of items we need to remove because body can send weird data
        const recipeRequirementsClone = this.cloner.clone(
            recipe.requirements.filter((r) => r.type === "Item" || r.type === "Tool"),
        );

        const output = this.eventOutputHolder.getOutput(sessionID);
        const itemsToDelete = body.items.concat(body.tools);
        for (const itemToDelete of itemsToDelete) {
            const itemToCheck = pmcData.Inventory.items.find((i) => i._id === itemToDelete.id);
            const requirement = recipeRequirementsClone.find(
                (requirement) => requirement.templateId === itemToCheck._tpl,
            );

            // Handle tools not having a `count`, but always only requiring 1
            const requiredCount = requirement.count ?? 1;
            if (requiredCount <= 0) {
                continue;
            }

            this.inventoryHelper.removeItemByCount(pmcData, itemToDelete.id, requiredCount, sessionID, output);

            // Tools don't have a count
            if (requirement.type !== "Tool") {
                requirement.count -= itemToDelete.count;
            }
        }

        return output;
    }

    /**
     * Handle HideoutScavCaseProductionStart event
     * Handles event after clicking 'start' on the scav case hideout page
     * @param pmcData player profile
     * @param body client request object
     * @param sessionID session id
     * @returns item event router response
     */
    public scavCaseProductionStart(
        pmcData: IPmcData,
        body: IHideoutScavCaseStartRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionID);

        for (const requestedItem of body.items) {
            const inventoryItem = pmcData.Inventory.items.find((item) => item._id === requestedItem.id);
            if (!inventoryItem) {
                this.logger.error(
                    this.localisationService.getText(
                        "hideout-unable_to_find_scavcase_requested_item_in_profile_inventory",
                        requestedItem.id,
                    ),
                );
                return this.httpResponse.appendErrorToOutput(output);
            }

            if (inventoryItem.upd?.StackObjectsCount && inventoryItem.upd.StackObjectsCount > requestedItem.count) {
                inventoryItem.upd.StackObjectsCount -= requestedItem.count;
            } else {
                this.inventoryHelper.removeItem(pmcData, requestedItem.id, sessionID, output);
            }
        }

        const recipe = this.databaseService.getHideout().scavcase.find((r) => r._id === body.recipeId);
        if (!recipe) {
            this.logger.error(
                this.localisationService.getText("hideout-unable_to_find_scav_case_recipie_in_database", body.recipeId),
            );

            return this.httpResponse.appendErrorToOutput(output);
        }

        // @Important: Here we need to be very exact:
        // - normal recipe: Production time value is stored in attribute "productionTime" with small "p"
        // - scav case recipe: Production time value is stored in attribute "ProductionTime" with capital "P"
        const adjustedCraftTime =
            recipe.ProductionTime -
            this.hideoutHelper.getSkillProductionTimeReduction(
                pmcData,
                recipe.ProductionTime,
                SkillTypes.CRAFTING,
                this.databaseService.getGlobals().config.SkillsSettings.Crafting.CraftTimeReductionPerLevel,
            );

        const modifiedScavCaseTime = this.getScavCaseTime(pmcData, adjustedCraftTime);

        pmcData.Hideout.Production[body.recipeId] = this.hideoutHelper.initProduction(
            body.recipeId,
            this.profileHelper.isDeveloperAccount(sessionID) ? 40 : modifiedScavCaseTime,
            false,
        );
        pmcData.Hideout.Production[body.recipeId].sptIsScavCase = true;

        return output;
    }

    /**
     * Adjust scav case time based on fence standing
     *
     * @param pmcData Player profile
     * @param productionTime Time to complete scav case in seconds
     * @returns Adjusted scav case time in seconds
     */
    protected getScavCaseTime(pmcData: IPmcData, productionTime: number): number {
        const fenceLevel = this.fenceService.getFenceInfo(pmcData);
        if (!fenceLevel) {
            return productionTime;
        }

        return productionTime * fenceLevel.ScavCaseTimeModifier;
    }

    /**
     * Add generated scav case rewards to player profile
     * @param pmcData player profile to add rewards to
     * @param rewards reward items to add to profile
     * @param recipeId recipe id to save into Production dict
     */
    protected addScavCaseRewardsToProfile(pmcData: IPmcData, rewards: Product[], recipeId: string): void {
        pmcData.Hideout.Production[`ScavCase${recipeId}`] = { Products: rewards };
    }

    /**
     * Start production of continuously created item
     * @param pmcData Player profile
     * @param request Continious production request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public continuousProductionStart(
        pmcData: IPmcData,
        request: IHideoutContinuousProductionStartRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        this.hideoutHelper.registerProduction(pmcData, request, sessionID);

        return this.eventOutputHolder.getOutput(sessionID);
    }

    /**
     * Handle HideoutTakeProduction event
     * Take completed item out of hideout area and place into player inventory
     * @param pmcData Player profile
     * @param request Remove production from area request
     * @param sessionID Session id
     * @returns IItemEventRouterResponse
     */
    public takeProduction(
        pmcData: IPmcData,
        request: IHideoutTakeProductionRequestData,
        sessionID: string,
    ): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionID);
        const hideoutDb = this.databaseService.getHideout();

        if (request.recipeId === HideoutHelper.bitcoinFarm) {
            // Ensure server and client are in-sync when player presses 'get items' on farm
            this.hideoutHelper.updatePlayerHideout(sessionID);
            this.hideoutHelper.getBTC(pmcData, request, sessionID, output);

            return output;
        }

        const recipe = hideoutDb.production.recipes.find((r) => r._id === request.recipeId);
        if (recipe) {
            this.handleRecipe(sessionID, recipe, pmcData, request, output);

            return output;
        }

        const scavCase = hideoutDb.scavcase.find((r) => r._id === request.recipeId);
        if (scavCase) {
            this.handleScavCase(sessionID, pmcData, request, output);

            return output;
        }

        this.logger.error(
            this.localisationService.getText(
                "hideout-unable_to_find_production_in_profile_by_recipie_id",
                request.recipeId,
            ),
        );

        return this.httpResponse.appendErrorToOutput(output);
    }

    /**
     * Take recipe-type production out of hideout area and place into player inventory
     * @param sessionID Session id
     * @param recipe Completed recipe of item
     * @param pmcData Player profile
     * @param request Remove production from area request
     * @param output Output object to update
     */
    protected handleRecipe(
        sessionID: string,
        recipe: IHideoutProduction,
        pmcData: IPmcData,
        request: IHideoutTakeProductionRequestData,
        output: IItemEventRouterResponse,
    ): void {
        // Validate that we have a matching production
        const productionDict = Object.entries(pmcData.Hideout.Production);
        let prodId: string;
        for (const [productionId, production] of productionDict) {
            // Skip undefined production objects
            if (!production) {
                continue;
            }

            if (this.hideoutHelper.isProductionType(production)) {
                // Production or ScavCase
                if (production.RecipeId === request.recipeId) {
                    prodId = productionId; // Set to objects key
                    break;
                }
            }
        }

        // If we're unable to find the production, send an error to the client
        if (prodId === undefined) {
            this.logger.error(
                this.localisationService.getText(
                    "hideout-unable_to_find_production_in_profile_by_recipie_id",
                    request.recipeId,
                ),
            );

            this.httpResponse.appendErrorToOutput(
                output,
                this.localisationService.getText(
                    "hideout-unable_to_find_production_in_profile_by_recipie_id",
                    request.recipeId,
                ),
            );

            return;
        }

        // Variables for managemnet of skill
        let craftingExpAmount = 0;

        const counterHoursCrafting = this.getHoursCraftingTaskConditionCounter(pmcData, recipe);
        let hoursCrafting = counterHoursCrafting.value;

        /** Array of arrays of item + children */
        let itemAndChildrenToSendToPlayer: Item[][] = [];

        // Reward is weapon/armor preset, handle differently compared to 'normal' items
        const rewardIsPreset = this.presetHelper.hasPreset(recipe.endProduct);
        if (rewardIsPreset) {
            const preset = this.presetHelper.getDefaultPreset(recipe.endProduct);

            // Ensure preset has unique ids and is cloned so we don't alter the preset data stored in memory
            const presetAndMods: Item[] = this.itemHelper.replaceIDs(preset._items);

            this.itemHelper.remapRootItemId(presetAndMods);

            // Store preset items in array
            itemAndChildrenToSendToPlayer = [presetAndMods];
        }

        const rewardIsStackable = this.itemHelper.isItemTplStackable(recipe.endProduct);
        if (rewardIsStackable) {
            // Create root item
            const rewardToAdd: Item = {
                _id: this.hashUtil.generate(),
                _tpl: recipe.endProduct,
                upd: { StackObjectsCount: recipe.count },
            };

            // Split item into separate items with acceptable stack sizes
            const splitReward = this.itemHelper.splitStackIntoSeparateItems(rewardToAdd);
            itemAndChildrenToSendToPlayer.push(...splitReward);
        } else {
            // Not stackable, may have to send send multiple of reward

            // Add the first reward item to array when not a preset (first preset added above earlier)
            if (!rewardIsPreset) {
                itemAndChildrenToSendToPlayer.push([{ _id: this.hashUtil.generate(), _tpl: recipe.endProduct }]);
            }

            // Add multiple of item if recipe requests it
            // Start index at one so we ignore first item in array
            const countOfItemsToReward = recipe.count;
            for (let index = 1; index < countOfItemsToReward; index++) {
                const itemAndMods: Item[] = this.itemHelper.replaceIDs(itemAndChildrenToSendToPlayer[0]);
                itemAndChildrenToSendToPlayer.push(...[itemAndMods]);
            }
        }

        // Recipe has an `isEncoded` requirement for reward(s), Add `RecodableComponent` property
        if (recipe.isEncoded) {
            for (const reward of itemAndChildrenToSendToPlayer) {
                this.itemHelper.addUpdObjectToItem(reward[0]);

                reward[0].upd.RecodableComponent = { IsEncoded: true };
            }
        }

        // Build an array of the tools that need to be returned to the player
        const toolsToSendToPlayer: Item[][] = [];
        const production = pmcData.Hideout.Production[prodId];
        if (production.sptRequiredTools?.length > 0) {
            for (const tool of production.sptRequiredTools) {
                toolsToSendToPlayer.push([tool]);
            }
        }

        // Check if the recipe is the same as the last one - get bonus when crafting same thing multiple times
        const area = pmcData.Hideout.Areas.find((area) => area.type === recipe.areaType);
        if (area && request.recipeId !== area.lastRecipe) {
            // 1 point per craft upon the end of production for alternating between 2 different crafting recipes in the same module
            craftingExpAmount += this.hideoutConfig.expCraftAmount; // Default is 10
        }

        // Update variable with time spent crafting item(s)
        // 1 point per 8 hours of crafting
        hoursCrafting += recipe.productionTime;
        if (hoursCrafting / this.hideoutConfig.hoursForSkillCrafting >= 1) {
            // Spent enough time crafting to get a bonus xp multipler
            const multiplierCrafting = Math.floor(hoursCrafting / this.hideoutConfig.hoursForSkillCrafting);
            craftingExpAmount += 1 * multiplierCrafting;
            hoursCrafting -= this.hideoutConfig.hoursForSkillCrafting * multiplierCrafting;
        }

        // Make sure we can fit both the craft result and tools in the stash
        const totalResultItems = toolsToSendToPlayer.concat(itemAndChildrenToSendToPlayer);
        if (!this.inventoryHelper.canPlaceItemsInInventory(sessionID, totalResultItems)) {
            this.httpResponse.appendErrorToOutput(
                output,
                this.localisationService.getText("inventory-no_stash_space"),
                BackendErrorCodes.NOTENOUGHSPACE,
            );
            return;
        }

        // Add the tools to the stash, we have to do this individually due to FiR state potentially being different
        for (const toolItem of toolsToSendToPlayer) {
            // Note: FIR state will be based on the first item's SpawnedInSession property per item group
            const addToolsRequest: IAddItemsDirectRequest = {
                itemsWithModsToAdd: [toolItem],
                foundInRaid: toolItem[0].upd?.SpawnedInSession ?? false,
                useSortingTable: false,
                callback: undefined,
            };

            this.inventoryHelper.addItemsToStash(sessionID, addToolsRequest, pmcData, output);
            if (output.warnings.length > 0) {
                return;
            }
        }

        // Add the crafting result to the stash, marked as FiR
        const addItemsRequest: IAddItemsDirectRequest = {
            itemsWithModsToAdd: itemAndChildrenToSendToPlayer,
            foundInRaid: true,
            useSortingTable: false,
            callback: undefined,
        };
        this.inventoryHelper.addItemsToStash(sessionID, addItemsRequest, pmcData, output);
        if (output.warnings.length > 0) {
            return;
        }

        //  - increment skill point for crafting
        //  - delete the production in profile Hideout.Production
        // Hideout Management skill
        // ? use a configuration variable for the value?
        const globals = this.databaseService.getGlobals();
        this.profileHelper.addSkillPointsToPlayer(
            pmcData,
            SkillTypes.HIDEOUT_MANAGEMENT,
            globals.config.SkillsSettings.HideoutManagement.SkillPointsPerCraft,
            true,
        );

        // Add Crafting skill to player profile
        if (craftingExpAmount > 0) {
            this.profileHelper.addSkillPointsToPlayer(pmcData, SkillTypes.CRAFTING, craftingExpAmount);

            const intellectAmountToGive = 0.5 * Math.round(craftingExpAmount / 15);
            if (intellectAmountToGive > 0) {
                this.profileHelper.addSkillPointsToPlayer(pmcData, SkillTypes.INTELLECT, intellectAmountToGive);
            }
        }
        area.lastRecipe = request.recipeId;

        // Update profiles hours crafting value
        counterHoursCrafting.value = hoursCrafting;

        // Continuous crafts have special handling in EventOutputHolder.updateOutputProperties()
        pmcData.Hideout.Production[prodId].sptIsComplete = true;
        pmcData.Hideout.Production[prodId].sptIsContinuous = recipe.continuous;

        // Continious recipies need the craft time refreshed as it gets created once on initial craft and stays the same regardless of what
        // production.json is set to
        if (recipe.continuous) {
            pmcData.Hideout.Production[prodId].ProductionTime = this.hideoutHelper.getAdjustedCraftTimeWithSkills(
                pmcData,
                recipe._id,
                true,
            );
        }

        // Flag normal (non continious) crafts as complete
        if (!recipe.continuous) {
            pmcData.Hideout.Production[prodId].inProgress = false;
        }
    }

    /**
     * Get the "CounterHoursCrafting" TaskConditionCounter from a profile
     * @param pmcData Profile to get counter from
     * @param recipe Recipe being crafted
     * @returns ITaskConditionCounter
     */
    protected getHoursCraftingTaskConditionCounter(
        pmcData: IPmcData,
        recipe: IHideoutProduction,
    ): ITaskConditionCounter {
        let counterHoursCrafting = pmcData.TaskConditionCounters[HideoutController.nameTaskConditionCountersCrafting];
        if (!counterHoursCrafting) {
            // Doesn't exist, create
            pmcData.TaskConditionCounters[HideoutController.nameTaskConditionCountersCrafting] = {
                id: recipe._id,
                type: HideoutController.nameTaskConditionCountersCrafting,
                sourceId: "CounterCrafting",
                value: 0,
            };
            counterHoursCrafting = pmcData.TaskConditionCounters[HideoutController.nameTaskConditionCountersCrafting];
        }
        return counterHoursCrafting;
    }

    /**
     * Handles generating case rewards and sending to player inventory
     * @param sessionID Session id
     * @param pmcData Player profile
     * @param request Get rewards from scavcase craft request
     * @param output Output object to update
     */
    protected handleScavCase(
        sessionID: string,
        pmcData: IPmcData,
        request: IHideoutTakeProductionRequestData,
        output: IItemEventRouterResponse,
    ): void {
        const ongoingProductions = Object.entries(pmcData.Hideout.Production);
        let prodId: string;
        for (const production of ongoingProductions) {
            if (this.hideoutHelper.isProductionType(production[1])) {
                // Production or ScavCase
                if ((production[1] as ScavCase).RecipeId === request.recipeId) {
                    prodId = production[0]; // Set to objects key
                    break;
                }
            }
        }

        if (prodId === undefined) {
            this.logger.error(
                this.localisationService.getText(
                    "hideout-unable_to_find_production_in_profile_by_recipie_id",
                    request.recipeId,
                ),
            );

            this.httpResponse.appendErrorToOutput(output);

            return;
        }

        // Create rewards for scav case
        const scavCaseRewards = this.scavCaseRewardGenerator.generate(request.recipeId);

        const addItemsRequest: IAddItemsDirectRequest = {
            itemsWithModsToAdd: scavCaseRewards,
            foundInRaid: true,
            callback: undefined,
            useSortingTable: false,
        };

        this.inventoryHelper.addItemsToStash(sessionID, addItemsRequest, pmcData, output);
        if (output.warnings.length > 0) {
            return;
        }

        // Remove the old production from output object before its sent to client
        delete output.profileChanges[sessionID].production[request.recipeId];

        // Flag as complete - will be cleaned up later by hideoutController.update()
        pmcData.Hideout.Production[prodId].sptIsComplete = true;

        // Crafting complete, flag
        pmcData.Hideout.Production[prodId].inProgress = false;
    }

    /**
     * Get quick time event list for hideout
     * // TODO - implement this
     * @param sessionId Session id
     * @returns IQteData array
     */
    public getQteList(sessionId: string): IQteData[] {
        return this.databaseService.getHideout().qte;
    }

    /**
     * Handle HideoutQuickTimeEvent on client/game/profile/items/moving
     * Called after completing workout at gym
     * @param sessionId Session id
     * @param pmcData Profile to adjust
     * @param request QTE result object
     */
    public handleQTEEventOutcome(
        sessionId: string,
        pmcData: IPmcData,
        request: IHandleQTEEventRequestData,
        output: IItemEventRouterResponse,
    ): void {
        // {
        //     "Action": "HideoutQuickTimeEvent",
        //     "results": [true, false, true, true, true, true, true, true, true, false, false, false, false, false, false],
        //     "id": "63b16feb5d012c402c01f6ef",
        //     "timestamp": 1672585349
        // }

        // Skill changes are done in
        // /client/hideout/workout (applyWorkoutChanges).

        pmcData.Health.Energy.Current -= 50;
        if (pmcData.Health.Energy.Current < 1) {
            pmcData.Health.Energy.Current = 1;
        }

        pmcData.Health.Hydration.Current -= 50;
        if (pmcData.Health.Hydration.Current < 1) {
            pmcData.Health.Hydration.Current = 1;
        }
    }

    /**
     * Record a high score from the shooting range into a player profiles overallcounters
     * @param sessionId Session id
     * @param pmcData Profile to update
     * @param request shooting range score request
     * @returns IItemEventRouterResponse
     */
    public recordShootingRangePoints(sessionId: string, pmcData: IPmcData, request: IRecordShootingRangePoints): void {
        const shootingRangeKey = "ShootingRangePoints";
        const overallCounterItems = pmcData.Stats.Eft.OverallCounters.Items;

        // Find counter by key
        let shootingRangeHighScore = overallCounterItems.find((counter) => counter.Key.includes(shootingRangeKey));
        if (!shootingRangeHighScore) {
            // Counter not found, add blank one
            overallCounterItems.push({ Key: [shootingRangeKey], Value: 0 });
            shootingRangeHighScore = overallCounterItems.find((counter) => counter.Key.includes(shootingRangeKey));
        }

        shootingRangeHighScore.Value = request.points;
    }

    /**
     * Handle client/game/profile/items/moving - HideoutImproveArea
     * @param sessionId Session id
     * @param pmcData Profile to improve area in
     * @param request Improve area request data
     */
    public improveArea(
        sessionId: string,
        pmcData: IPmcData,
        request: IHideoutImproveAreaRequestData,
    ): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionId);

        // Create mapping of required item with corrisponding item from player inventory
        const items = request.items.map((reqItem) => {
            const item = pmcData.Inventory.items.find((invItem) => invItem._id === reqItem.id);
            return { inventoryItem: item, requestedItem: reqItem };
        });

        // If it's not money, its construction / barter items
        for (const item of items) {
            if (!item.inventoryItem) {
                this.logger.error(
                    this.localisationService.getText("hideout-unable_to_find_item_in_inventory", item.requestedItem.id),
                );
                return this.httpResponse.appendErrorToOutput(output);
            }

            if (
                this.paymentHelper.isMoneyTpl(item.inventoryItem._tpl) &&
                item.inventoryItem.upd &&
                item.inventoryItem.upd.StackObjectsCount &&
                item.inventoryItem.upd.StackObjectsCount > item.requestedItem.count
            ) {
                item.inventoryItem.upd.StackObjectsCount -= item.requestedItem.count;
            } else {
                this.inventoryHelper.removeItem(pmcData, item.inventoryItem._id, sessionId, output);
            }
        }

        const profileHideoutArea = pmcData.Hideout.Areas.find((x) => x.type === request.areaType);
        if (!profileHideoutArea) {
            this.logger.error(this.localisationService.getText("hideout-unable_to_find_area", request.areaType));
            return this.httpResponse.appendErrorToOutput(output);
        }

        const hideoutDbData = this.databaseService.getHideout().areas.find((area) => area.type === request.areaType);
        if (!hideoutDbData) {
            this.logger.error(
                this.localisationService.getText("hideout-unable_to_find_area_in_database", request.areaType),
            );
            return this.httpResponse.appendErrorToOutput(output);
        }

        // Add all improvemets to output object
        const improvements = hideoutDbData.stages[profileHideoutArea.level].improvements;
        const timestamp = this.timeUtil.getTimestamp();

        if (!output.profileChanges[sessionId].improvements) {
            output.profileChanges[sessionId].improvements = {};
        }

        for (const improvement of improvements) {
            const improvementDetails = {
                completed: false,
                improveCompleteTimestamp: timestamp + improvement.improvementTime,
            };
            output.profileChanges[sessionId].improvements[improvement.id] = improvementDetails;
            pmcData.Hideout.Improvements[improvement.id] = improvementDetails;
        }

        return output;
    }

    /**
     * Handle client/game/profile/items/moving HideoutCancelProductionCommand
     * @param sessionId Session id
     * @param pmcData Profile with craft to cancel
     * @param request Cancel production request data
     * @returns IItemEventRouterResponse
     */
    public cancelProduction(
        sessionId: string,
        pmcData: IPmcData,
        request: IHideoutCancelProductionRequestData,
    ): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionId);

        const craftToCancel = pmcData.Hideout.Production[request.recipeId];
        if (!craftToCancel) {
            const errorMessage = `Unable to find craft ${request.recipeId} to cancel`;
            this.logger.error(errorMessage);

            return this.httpResponse.appendErrorToOutput(output, errorMessage);
        }

        // Null out production data so client gets informed when response send back
        pmcData.Hideout.Production[request.recipeId] = undefined;

        // TODO - handle timestamp somehow?

        return output;
    }

    /**
     * Handle client/game/profile/items/moving - HideoutCircleOfCultistProductionStart
     * @param sessionId Session id
     * @param pmcData Profile of crafter
     * @param request Request data
     */
    public circleOfCultistProductionStart(
        sessionId: string,
        pmcData: IPmcData,
        request: IHideoutCircleOfCultistProductionStartRequestData,
    ): IItemEventRouterResponse {
        const cultistCircleStashId = pmcData.Inventory.hideoutAreaStashes[HideoutAreas.CIRCLE_OF_CULTISTS];

        // Sparse, just has id
        const cultistCraftData = this.databaseService.getHideout().production.cultistRecipes[0];
        const sacrificedItems: Item[] = this.getSacrificedItems(pmcData);
        const sacrificedItemCostRoubles = sacrificedItems.reduce(
            (sum, curr) => sum + (this.itemHelper.getItemPrice(curr._tpl) ?? 0),
            0,
        );

        // TODO - include hideout management skill to bonus
        const rewardAmountmultiplier = this.randomUtil.getFloat(0.7, 1.4);
        const rewardAmountRoubles = sacrificedItemCostRoubles * rewardAmountmultiplier;

        // Create production in pmc profile
        this.hideoutHelper.registerCircleOfCultistProduction(sessionId, pmcData, cultistCraftData._id, sacrificedItems);

        const output = this.eventOutputHolder.getOutput(sessionId);

        // Remove sacrified items
        const slotId = "CircleOfCultistsGrid1";
        for (const item of sacrificedItems) {
            if (item.slotId === slotId) {
                this.inventoryHelper.removeItem(pmcData, item._id, sessionId, output);
            }
        }

        //const rewardItemPool = cultistStashDbItem[1]._props.Grids[0]._props.filters[0].Filter;
        const rewardItemPool = this.getCultistCircleRewardPool(sessionId, pmcData);
        this.logger.warning(`Reward pool size: ${rewardItemPool.length}`);
        // Prep rewards array (reward can be item with children, hence array of arrays)
        const rewards: Item[][] = [];

        // Pick random rewards until we have exhausted the sacrificed items cost amount
        let amountRoubles = 0;
        let itemsRewardedCount = 0;
        while (amountRoubles < rewardAmountRoubles && rewardItemPool.length > 0 && itemsRewardedCount < 5) {
            const randomItemTplFromPool = this.randomUtil.getArrayValue(rewardItemPool);
            const rewardItem: Item = {
                _id: this.hashUtil.generate(),
                _tpl: randomItemTplFromPool,
                parentId: cultistCircleStashId,
                slotId: slotId,
                upd: {
                    StackObjectsCount: 1,
                    SpawnedInSession: true,
                },
            };

            // Increment price of rewards to give to player and add to reward array
            itemsRewardedCount++;
            amountRoubles += this.itemHelper.getItemPrice(randomItemTplFromPool);
            rewards.push([rewardItem]);
        }
        this.logger.warning(`Circle will reward ${rewards.length} items costing a total of ${amountRoubles} roubles`);

        // Get the container grid for cultist stash area
        const cultistStashDbItem = this.itemHelper.getItem(ItemTpl.HIDEOUTAREACONTAINER_CIRCLEOFCULTISTS_STASH_1);
        const containerGrid = this.inventoryHelper.getContainerSlotMap(cultistStashDbItem[1]._id);
        const canAddToContainer = this.inventoryHelper.canPlaceItemsInContainer(
            this.cloner.clone(containerGrid), // MUST clone grid before passing in as function modifies grid
            rewards,
        );

        this.logger.warning(`Can fit all items into container: ${canAddToContainer}`);
        if (canAddToContainer) {
            for (const itemToAdd of rewards) {
                this.logger.warning(`Placing reward: ${itemToAdd[0]._tpl} in circle grid`);
                this.inventoryHelper.placeItemInContainer(containerGrid, itemToAdd, cultistCircleStashId, slotId);

                // Add item + mods to output and profile inventory
                output.profileChanges[sessionId].items.new.push(...itemToAdd);
                pmcData.Inventory.items.push(...itemToAdd);
            }
        }

        return output;
    }

    /**
     * Get a pool of tpl IDs of items the player needs to complete hideout crafts/upgrade areas
     * @param sessionId Session id
     * @param pmcData Player profile
     * @returns Array of tpls
     */
    protected getCultistCircleRewardPool(sessionId: string, pmcData: IPmcData): string[] {
        const rewardPool = new Set<string>();

        // What does player need to upgrade hideout areas
        const dbAreas = this.databaseService.getHideout().areas;
        for (const area of pmcData.Hideout.Areas) {
            const currentStageLevel = area.level;
            const areaType = area.type;

            // Get next stage of area
            const dbArea = dbAreas.find((area) => area.type === areaType);
            const nextStageDbData = dbArea.stages[currentStageLevel + 1];
            if (nextStageDbData) {
                // Next stage exists, gather up requirements and add to pool
                const itemRequirements = this.getNonFunctionalItemRequirements(nextStageDbData.requirements);
                for (const rewardToAdd of itemRequirements) {
                    rewardPool.add(rewardToAdd.templateId);
                }
            }
        }

        // What does player need to craft items with
        const playerUnlockedRecipes = pmcData.UnlockedInfo.unlockedProductionRecipe;
        const allRecipes = this.databaseService.getHideout().production;

        // Get default unlocked recipes + locked recipes they've unlocked
        const playerAccessibleRecipes = allRecipes.recipes.filter(
            (recipe) => !recipe.locked || playerUnlockedRecipes.includes(recipe._id),
        );
        for (const recipe of playerAccessibleRecipes) {
            const itemRequirements = this.getNonFunctionalItemRequirements(recipe.requirements);
            for (const requirement of itemRequirements) {
                rewardPool.add(requirement.templateId);
            }
        }

        // Check for scav case unlock in profile
        const hasScavCaseAreaUnlocked = pmcData.Hideout.Areas[HideoutAreas.SCAV_CASE]?.level > 0;
        if (hasScavCaseAreaUnlocked) {
            // Gather up items used to start scav case crafts
            const scavCaseCrafts = this.databaseService.getHideout().scavcase;
            for (const craft of scavCaseCrafts) {
                // Find the item requirements from each craft
                const itemRequirements = this.getNonFunctionalItemRequirements(craft.Requirements);
                for (const requirement of itemRequirements) {
                    // Add tpl to reward pool
                    rewardPool.add(requirement.templateId);
                }
            }
        }

        return Array.from(rewardPool);
    }

    /**
     * Iterate over passed in hideout requirements and return the Item + nonfunctional requirements
     * @param requirements Requirements to iterate over
     * @returns Array of item requirements
     */
    protected getNonFunctionalItemRequirements(requirements: IStageRequirement[] | Requirement[]) {
        return requirements.filter((requirement) => requirement.type === "Item" && !requirement.isFunctional);
    }

    public hideoutDeleteProductionCommand(
        sessionId: string,
        pmcData: IPmcData,
        request: IHideoutDeleteProductionRequestData,
    ): IItemEventRouterResponse {
        const output = this.eventOutputHolder.getOutput(sessionId);

        pmcData.Hideout.Production[request.recipeId] = null;
        output.profileChanges[sessionId].production = null;
        return output;
    }

    protected getSacrificedItems(pmcData: IPmcData): Item[] {
        // Get root items that are in the cultist sacrifice window
        const inventoryRootItemsInCultistGrid = pmcData.Inventory.items.filter(
            (item) => item.slotId === "CircleOfCultistsGrid1",
        );

        // Get rootitem + its children
        const sacrificedItems: Item[] = [];
        for (const rootItem of inventoryRootItemsInCultistGrid) {
            const rootItemWithChildren = this.itemHelper.findAndReturnChildrenAsItems(
                pmcData.Inventory.items,
                rootItem._id,
            );
            sacrificedItems.push(...rootItemWithChildren);
        }
        return sacrificedItems;
    }

    /**
     * Function called every x seconds as part of onUpdate event
     */
    public update(): void {
        for (const sessionID in this.saveServer.getProfiles()) {
            if (
                "Hideout" in this.saveServer.getProfile(sessionID).characters.pmc &&
                this.profileActivityService.activeWithinLastMinutes(
                    sessionID,
                    this.hideoutConfig.updateProfileHideoutWhenActiveWithinMinutes,
                )
            ) {
                this.hideoutHelper.updatePlayerHideout(sessionID);
            }
        }
    }
}
