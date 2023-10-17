import { inject, injectable } from "tsyringe";

import { RepeatableQuestGenerator } from "../generators/RepeatableQuestGenerator";
import { ProfileHelper } from "../helpers/ProfileHelper";
import { RagfairServerHelper } from "../helpers/RagfairServerHelper";
import { RepeatableQuestHelper } from "../helpers/RepeatableQuestHelper";
import { IEmptyRequestData } from "../models/eft/common/IEmptyRequestData";
import { IPmcData } from "../models/eft/common/IPmcData";
import {
    IChangeRequirement,
    IPmcDataRepeatableQuest,
    IRepeatableQuest
} from "../models/eft/common/tables/IRepeatableQuests";
import { IItemEventRouterResponse } from "../models/eft/itemEvent/IItemEventRouterResponse";
import { IRepeatableQuestChangeRequest } from "../models/eft/quests/IRepeatableQuestChangeRequest";
import { ConfigTypes } from "../models/enums/ConfigTypes";
import { ELocationName } from "../models/enums/ELocationName";
import { HideoutAreas } from "../models/enums/HideoutAreas";
import { QuestStatus } from "../models/enums/QuestStatus";
import {
    IQuestConfig, IRepeatableQuestConfig
} from "../models/spt/config/IQuestConfig";
import { IQuestTypePool } from "../models/spt/repeatable/IQuestTypePool";
import { ILogger } from "../models/spt/utils/ILogger";
import { EventOutputHolder } from "../routers/EventOutputHolder";
import { ConfigServer } from "../servers/ConfigServer";
import { PaymentService } from "../services/PaymentService";
import { ProfileFixerService } from "../services/ProfileFixerService";
import { HttpResponseUtil } from "../utils/HttpResponseUtil";
import { JsonUtil } from "../utils/JsonUtil";
import { ObjectId } from "../utils/ObjectId";
import { RandomUtil } from "../utils/RandomUtil";
import { TimeUtil } from "../utils/TimeUtil";

@injectable()
export class RepeatableQuestController
{
    protected questConfig: IQuestConfig;

    constructor(
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("RandomUtil") protected randomUtil: RandomUtil,
        @inject("HttpResponseUtil") protected httpResponse: HttpResponseUtil,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("ProfileFixerService") protected profileFixerService: ProfileFixerService,
        @inject("RagfairServerHelper") protected ragfairServerHelper: RagfairServerHelper,
        @inject("EventOutputHolder") protected eventOutputHolder: EventOutputHolder,
        @inject("PaymentService") protected paymentService: PaymentService,
        @inject("ObjectId") protected objectId: ObjectId,
        @inject("RepeatableQuestGenerator") protected repeatableQuestGenerator: RepeatableQuestGenerator,
        @inject("RepeatableQuestHelper") protected repeatableQuestHelper: RepeatableQuestHelper,
        @inject("ConfigServer") protected configServer: ConfigServer
    )
    {
        this.questConfig = this.configServer.getConfig(ConfigTypes.QUEST);
    }


    /**
     * Handle client/repeatalbeQuests/activityPeriods
     * Returns an array of objects in the format of repeatable quests to the client.
     * repeatableQuestObject = {
     *  id: Unique Id,
     *  name: "Daily",
     *  endTime: the time when the quests expire
     *  activeQuests: currently available quests in an array. Each element of quest type format (see assets/database/templates/repeatableQuests.json).
     *  inactiveQuests: the quests which were previously active (required by client to fail them if they are not completed)
     * }
     *
     * The method checks if the player level requirement for repeatable quests (e.g. daily lvl5, weekly lvl15) is met and if the previously active quests
     * are still valid. This ischecked by endTime persisted in profile accordning to the resetTime configured for each repeatable kind (daily, weekly)
     * in QuestCondig.js
     *
     * If the condition is met, new repeatableQuests are created, old quests (which are persisted in the profile.RepeatableQuests[i].activeQuests) are
     * moved to profile.RepeatableQuests[i].inactiveQuests. This memory is required to get rid of old repeatable quest data in the profile, otherwise
     * they'll litter the profile's Quests field.
     * (if the are on "Succeed" but not "Completed" we keep them, to allow the player to complete them and get the rewards)
     * The new quests generated are again persisted in profile.RepeatableQuests
     *
     *
     * @param   {string}    sessionId       Player's session id
     * @returns  {array}                    array of "repeatableQuestObjects" as descibed above
     */
    public getClientRepeatableQuests(_info: IEmptyRequestData, sessionID: string): IPmcDataRepeatableQuest[]
    {
        const returnData: Array<IPmcDataRepeatableQuest> = [];
        const pmcData = this.profileHelper.getPmcProfile(sessionID);
        const time = this.timeUtil.getTimestamp();
        const scavQuestUnlocked = pmcData?.Hideout?.Areas?.find(hideoutArea => hideoutArea.type === HideoutAreas.INTEL_CENTER)?.level >= 1;
        
        // Daily / weekly / Daily_Savage
        for (const repeatableConfig of this.questConfig.repeatableQuests)
        {
            // get daily/weekly data from profile, add empty object if missing
            const currentRepeatableType = this.getRepeatableQuestSubTypeFromProfile(repeatableConfig, pmcData);
            
            if (repeatableConfig.side === "Pmc"
                && pmcData.Info.Level >= repeatableConfig.minPlayerLevel || repeatableConfig.side === "Scav" && scavQuestUnlocked)
            {
                if (time > currentRepeatableType.endTime - 1)
                {
                    currentRepeatableType.endTime = time + repeatableConfig.resetTime;
                    currentRepeatableType.inactiveQuests = [];
                    this.logger.debug(`Generating new ${repeatableConfig.name}`);

                    // put old quests to inactive (this is required since only then the client makes them fail due to non-completion)
                    // we also need to push them to the "inactiveQuests" list since we need to remove them from offraidData.profile.Quests
                    // after a raid (the client seems to keep quests internally and we want to get rid of old repeatable quests)
                    // and remove them from the PMC's Quests and RepeatableQuests[i].activeQuests
                    const questsToKeep = [];
                    //for (let i = 0; i < currentRepeatable.activeQuests.length; i++)
                    for (const activeQuest of currentRepeatableType.activeQuests)
                    {
                        // check if the quest is ready to be completed, if so, don't remove it
                        const quest = pmcData.Quests.filter(q => q.qid === activeQuest._id);
                        if (quest.length > 0)
                        {
                            if (quest[0].status === QuestStatus.AvailableForFinish)
                            {
                                questsToKeep.push(activeQuest);
                                this.logger.debug(`Keeping repeatable quest ${activeQuest._id} in activeQuests since it is available to AvailableForFinish`);
                                continue;
                            }
                        }
                        this.profileFixerService.removeDanglingConditionCounters(pmcData);
                        pmcData.Quests = pmcData.Quests.filter(q => q.qid !== activeQuest._id);
                        currentRepeatableType.inactiveQuests.push(activeQuest);
                    }
                    currentRepeatableType.activeQuests = questsToKeep;

                    // introduce a dynamic quest pool to avoid duplicates
                    const questTypePool = this.generateQuestPool(repeatableConfig, pmcData.Info.Level);

                    // Add daily quests
                    for (let i = 0; i < repeatableConfig.numQuests; i++)
                    {
                        let quest = null;
                        let lifeline = 0;
                        while (!quest && questTypePool.types.length > 0)
                        {
                            quest = this.repeatableQuestGenerator.generateRepeatableQuest(
                                pmcData.Info.Level,
                                pmcData.TradersInfo,
                                questTypePool,
                                repeatableConfig
                            );
                            lifeline++;
                            if (lifeline > 10)
                            {
                                this.logger.debug("We were stuck in repeatable quest generation. This should never happen. Please report");
                                break;
                            }
                        }

                        // check if there are no more quest types available
                        if (questTypePool.types.length === 0)
                        {
                            break;
                        }
                        quest.side = repeatableConfig.side;
                        currentRepeatableType.activeQuests.push(quest);
                    }
                }
                else
                {
                    this.logger.debug(`[Quest Check] ${repeatableConfig.name} quests are still valid.`);
                }
            }

            // create stupid redundant change requirements from quest data
            for (const quest of currentRepeatableType.activeQuests)
            {
                currentRepeatableType.changeRequirement[quest._id] = {
                    changeCost: quest.changeCost,
                    changeStandingCost: quest.changeStandingCost
                };
            }

            returnData.push({
                id: this.objectId.generate(),
                name: currentRepeatableType.name,
                endTime: currentRepeatableType.endTime,
                activeQuests: currentRepeatableType.activeQuests,
                inactiveQuests: currentRepeatableType.inactiveQuests,
                changeRequirement: currentRepeatableType.changeRequirement
            });
        }

        return returnData;
    }

    /**
     * Get repeatable quest data from profile from name (daily/weekly), creates base repeatable quest object if none exists
     * @param repeatableConfig daily/weekly config
     * @param pmcData Profile to search
     * @returns IPmcDataRepeatableQuest
     */
    protected getRepeatableQuestSubTypeFromProfile(repeatableConfig: IRepeatableQuestConfig, pmcData: IPmcData): IPmcDataRepeatableQuest 
    {
        // Get from profile, add if missing
        let repeatableQuestDetails = pmcData.RepeatableQuests.find(x => x.name === repeatableConfig.name);
        if (!repeatableQuestDetails)
        {
            repeatableQuestDetails = {
                name: repeatableConfig.name,
                activeQuests: [],
                inactiveQuests: [],
                endTime: 0,
                changeRequirement: {}
            };

            // Add base object that holds repeatable data to profile
            pmcData.RepeatableQuests.push(repeatableQuestDetails);
        }

        return repeatableQuestDetails;
    }

    /**
     * Just for debug reasons. Draws dailies a random assort of dailies extracted from dumps
     */
    public generateDebugDailies(dailiesPool: any, factory: any, number: number): any
    {
        let randomQuests = [];
        if (factory)
        {
            // First is factory extract always add for debugging
            randomQuests.push(dailiesPool[0]);
            number -= 1;
        }

        randomQuests = randomQuests.concat(this.randomUtil.drawRandomFromList(dailiesPool, number, false));

        for (const element of randomQuests)
        {
            element._id = this.objectId.generate();
            const conditions = element.conditions.AvailableForFinish;
            for (const element of conditions)
            {
                if ("counter" in element._props)
                {
                    element._props.counter.id = this.objectId.generate();
                }
            }
        }
        return randomQuests;
    }

    /**
     * Used to create a quest pool during each cycle of repeatable quest generation. The pool will be subsequently
     * narrowed down during quest generation to avoid duplicate quests. Like duplicate extractions or elimination quests
     * where you have to e.g. kill scavs in same locations.
     * @param repeatableConfig main repeatable quest config
     * @param pmcLevel level of pmc generating quest pool
     * @returns IQuestTypePool
     */
    protected generateQuestPool(repeatableConfig: IRepeatableQuestConfig, pmcLevel: number): IQuestTypePool
    {
        const questPool = this.createBaseQuestPool(repeatableConfig);

        for (const location in repeatableConfig.locations)
        {
            if (location !== ELocationName.ANY)
            {
                questPool.pool.Exploration.locations[location] = repeatableConfig.locations[location];
                questPool.pool.Pickup.locations[location] = repeatableConfig.locations[location];
            }
        }

        // Add "any" to pickup quest pool
        questPool.pool.Pickup.locations["any"] = ["any"];

        const eliminationConfig = this.repeatableQuestHelper.getEliminationConfigByPmcLevel(pmcLevel, repeatableConfig);
        const targetsConfig = this.repeatableQuestHelper.probabilityObjectArray(eliminationConfig.targets);
        for (const probabilityObject of targetsConfig)
        {
            // Target is boss
            if (probabilityObject.data.isBoss)
            {
                questPool.pool.Elimination.targets[probabilityObject.key] = { locations: ["any"] };
            }
            else
            {
                const possibleLocations = Object.keys(repeatableConfig.locations);

                // Set possible locations for elimination task, ift arget is savage, exclude labs from locations
                questPool.pool.Elimination.targets[probabilityObject.key] = (probabilityObject.key === "Savage")
                    ? { locations: possibleLocations.filter(x => x !== "laboratory")}
                    : { locations: possibleLocations };
            }
        }

        return questPool;
    }

    protected createBaseQuestPool(repeatableConfig: IRepeatableQuestConfig): IQuestTypePool
    {
        return {
            types: repeatableConfig.types.slice(),
            pool: {
                Exploration: {
                    locations: {}
                },
                Elimination: {
                    targets: {}
                },
                Pickup: {
                    locations: {}
                }
            }
        };
    }

    public debugLogRepeatableQuestIds(pmcData: IPmcData): void
    {
        for (const repeatable of pmcData.RepeatableQuests)
        {
            const activeQuestsIds = [];
            const inactiveQuestsIds = [];
            for (const active of repeatable.activeQuests)
            {
                activeQuestsIds.push(active._id);
            }

            for (const inactive of repeatable.inactiveQuests)
            {
                inactiveQuestsIds.push(inactive._id);
            }

            this.logger.debug(`${repeatable.name} activeIds ${activeQuestsIds}`);
            this.logger.debug(`${repeatable.name} inactiveIds ${inactiveQuestsIds}`);
        }
    }

    /**
     * Handle RepeatableQuestChange event
     */
    public changeRepeatableQuest(pmcData: IPmcData, changeRequest: IRepeatableQuestChangeRequest, sessionID: string): IItemEventRouterResponse
    {
        let repeatableToChange: IPmcDataRepeatableQuest;
        let changeRequirement: IChangeRequirement;
        let existingQuestTraderId: string;

        // Daily or weekly
        for (const currentRepeatable of pmcData.RepeatableQuests)
        {
            // Check for existing quest in (daily/weekly arrays)
            const existingQuest = currentRepeatable.activeQuests.find(x => x._id === changeRequest.qid);
            if (existingQuest)
            {
                existingQuestTraderId = existingQuest.traderId;
            }

            const numQuests = currentRepeatable.activeQuests.length;
            currentRepeatable.activeQuests = currentRepeatable.activeQuests.filter(x => x._id !== changeRequest.qid);
            if (numQuests > currentRepeatable.activeQuests.length)
            {
                // Get saved costs to replace existing quest
                changeRequirement = this.jsonUtil.clone(currentRepeatable.changeRequirement[changeRequest.qid]);
                delete currentRepeatable.changeRequirement[changeRequest.qid];
                const repeatableConfig = this.questConfig.repeatableQuests.find(x => x.name === currentRepeatable.name);
                const questTypePool = this.generateQuestPool(repeatableConfig, pmcData.Info.Level);
                // TODO: somehow we need to reduce the questPool by the currently active quests (for all repeatables)
                let newRepeatableQuest: IRepeatableQuest = null;
                let attemptsToGenerateQuest = 0;
                while (!newRepeatableQuest && questTypePool.types.length > 0)
                {
                    newRepeatableQuest = this.repeatableQuestGenerator.generateRepeatableQuest(
                        pmcData.Info.Level,
                        pmcData.TradersInfo,
                        questTypePool,
                        repeatableConfig
                    );
                    attemptsToGenerateQuest++;
                    if (attemptsToGenerateQuest > 10)
                    {
                        this.logger.debug("We were stuck in repeatable quest generation. This should never happen. Please report");
                        break;
                    }
                }

                if (newRepeatableQuest)
                {
                    // Add newly generated quest to daily/weekly array
                    newRepeatableQuest.side = repeatableConfig.side;
                    currentRepeatable.activeQuests.push(newRepeatableQuest);
                    currentRepeatable.changeRequirement[newRepeatableQuest._id] = {
                        changeCost: newRepeatableQuest.changeCost,
                        changeStandingCost: newRepeatableQuest.changeStandingCost
                    };
                }

                // Found and replaced the quest in current repeatable
                repeatableToChange = this.jsonUtil.clone(currentRepeatable);
                delete repeatableToChange.inactiveQuests;
                break;
            }
        }

        let output = this.eventOutputHolder.getOutput(sessionID);
        if (!repeatableToChange)
        {
            return this.httpResponse.appendErrorToOutput(output, "Unable to find repeatable quest to replace");
        }

        // Charge player money for replacing quest
        for (const cost of changeRequirement.changeCost)
        {
            output = this.paymentService.addPaymentToOutput(pmcData, cost.templateId, cost.count, sessionID, output);
            if (output.warnings.length > 0)
            {
                return output;
            }
        }

        // Reduce standing with trader for not doing their quest
        const droppedQuestTrader = pmcData.TradersInfo[existingQuestTraderId];
        droppedQuestTrader.standing -= changeRequirement.changeStandingCost;

        // Update client output with new repeatable
        output.profileChanges[sessionID].repeatableQuests = [repeatableToChange];

        return output;
    }
}
