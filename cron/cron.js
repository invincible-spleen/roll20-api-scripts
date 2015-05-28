var cron = cron || {
    jobTimers: {},

    init: function(){
	if (!state.hasOwnProperty('cron')){ state.cron = {}; }
	if (!state.cron.hasOwnProperty('countJobs')){ state.cron.countJobs = {}; }
	if (!state.cron.hasOwnProperty('timedJobs')){ state.cron.timedJobs = {}; }

	// set timers for existing timed jobs
	for (var jobId in state.cron.timedJobs){
	    var job = state.cron.timedJobs[jobId];
	    var handlerFunc = function(){ cron.handleTimedJob(jobId); }
	    var fireDate = new Date(job['timestamp']);
	    var curDate = new Date();
	    while (fireDate < curDate){
		if (job['interval'] > 0){
		    fireDate.setTime(fireDate.valueOf() + job['interval'] * 1000);
		}
		else{
		    fireDate.setTime(curDate.valueOf() + 100);
		}
	    }
	    var timestamp = fireDate.valueOf() - curDate.valueOf();
	    cron.jobTimers[jobId] = {};
	    if (job['interval'] > 0){
		var timerFunc = function(){
		    delete cron.jobTimers[jobId]['timerId'];
		    handlerFunc();
		    cron.jobTimers[jobId]['intervalId'] = setInterval(handlerFunc, job['interval'] * 1000);
		};
		cron.jobTimers[jobId]['timerId'] = setTimeout(timerFunc, timestamp);
	    }
	    else{
		cron.jobTimers[jobId]['timerId'] = setTimeout(handlerFunc, timestamp);
	    }
	}

	cron.nextJob = 1; // we'll check for ID uniqueness when creating job, so initializing to 1 will give us the lowest available ID
    },

    handleJob: function(job){
	sendChat(job['from'] || "CronD", job['command']);
    },

    handleTimedJob: function(jobId){
	var job = state.cron.timedJobs[jobId];
	cron.handleJob(job);
	if (job.interval <= 0){
	    delete state.cron.timedJobs[jobId];
	    if (cron.jobTimers[jobId]){
		delete cron.jobTimers[jobId];
	    }
	    // reap freed job ID
	    if (cron.nextJob > jobId){
		cron.nextJob = jobId;
	    }
	}
    },

    handleTurnChange: function(newTurnOrder, oldTurnOrder){
	var newTurns = JSON.parse((typeof(newTurnOrder) == typeof("") ? newTurnOrder : newTurnOrder.get('turnorder') || "[]"));
	var oldTurns = JSON.parse((typeof(oldTurnOrder) == typeof("") ? oldTurnOrder : oldTurnOrder.turnorder || "[]"));

	if ((!newTurns) || (!oldTurns)){ return; }
	if ((!newTurns.length) || (newTurns.length != oldTurns.length)){ return; } // something was added or removed; ignore
	if (newTurns[0].id == oldTurns[0].id){ return; } // turn didn't change

	var newCount = newTurns[0].pr;
	var oldCount = oldTurns[0].pr;

	if (newCount == oldCount){ return; } // initiative count didn't change

	var jobsToFire = [];
	var jobsToDelete = [];
	for (var i in state.cron.countJobs){
	    var job = state.cron.countJobs[i];
	    if ((job.count >= oldCount) && (job.count > newCount)){ continue; } // greater than oldCount and newCount, so not between them; ignore job
	    if ((job.count <= oldCount) && (job.count < newCount)){ continue; } // less than oldCount and newCount, so not between them; ignore job
	    // if we got here, then job is between oldCount and newCount (possibly equal to newCount); fire event or decrement rounds until firing
	    if (job.rounds > 0){ job.rounds -= 1; }
	    if (job.rounds == 0){
		jobsToFire.push([job.count, i]);
		if (job.interval > 0){
		    // reset job to fire again in interval rounds
		    job.rounds = job.interval;
		}
		else {
		    // prune one-time job
		    jobsToDelete.push(i);
		}
	    }
	}
	jobsToFire.sort();
	if (newCount < oldCount){ jobsToFire.reverse(); }
	for (var i = 0; i < jobsToFire.length; i++){
	    cron.handleJob(state.cron.countJobs[jobsToFire[i][1]]);
	}
	for (var i = 0; i < jobsToDelete.length; i++){
	    delete state.cron.countJobs[jobsToDelete[i]];
	    // reap freed job ID
	    if (cron.nextJob > jobsToDelete[i]){
		cron.nextJob = jobsToDelete[i];
	    }
	}
    },

    write: function(s, who, style, from){
	if (who){
	    who = "/w " + who.split(" ", 1)[0] + " ";
	}
	sendChat(from, who + s.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>"));
    },

    getNextId: function(){
	while ((cron.nextJob in state.cron.countJobs) || (cron.nextJob in state.cron.timedJobs)){
	    cron.nextJob += 1;
	}
	return cron.nextJob++;
    },

    addCountJob: function(command, from, count, rounds, interval){
	var jobId = cron.getNextId();
	state.cron.countJobs[jobId] = {
	    'command':	command,
	    'from':	from,
	    'count':	count,
	    'rounds':	rounds,
	    'interval':	interval
	};
	cron.write("Added initiative-based job with ID " + jobId, "", "", "CronD");
    },

    addTimedJob: function(command, from, timestamp, interval){
	var jobId = cron.getNextId();
	state.cron.timedJobs[jobId] = {
	    'command':		command,
	    'from':		from,
	    'interval':		interval,
	    'timestamp':	timestamp
	};
	var handlerFunc = function(){ cron.handleTimedJob(jobId); };
	var fireDate = new Date(timestamp);
	var curDate = new Date();
	timestamp = fireDate.valueOf() - curDate.valueOf();
	if (timestamp <= 0){ timestamp = 1; }
	cron.jobTimers[jobId] = {};
	if (interval > 0){
	    var timerFunc = function(){
		delete cron.jobTimers[jobId]['timerId'];
		handlerFunc();
		cron.jobTimers[jobId]['intervalId'] = setInterval(handlerFunc, interval * 1000);
	    };
	    cron.jobTimers[jobId]['timerId'] = setTimeout(timerFunc, timestamp);
	}
	else{
	    cron.jobTimers[jobId]['timerId'] = setTimeout(handlerFunc, timestamp);
	}
	cron.write("Added timed job with ID " + jobId, "", "", "CronD");
    },

    removeJob: function(jobId){
	if (jobId in state.cron.countJobs){
	    delete state.cron.countJobs[jobId];
	}
	else if (jobId in state.cron.timedJobs){
	    // must disable timer before removing job
	    if (cron.jobTimers[jobId]['timerId']){
		clearTimeout(cron.jobTimers[jobId]['timerId']);
	    }
	    if (cron.jobTimers[jobId]['intervalId']){
		clearInterval(cron.jobTimers[jobId]['intervalId']);
	    }
	    delete state.cron.timedJobs[jobId];
	    if (cron.jobTimers[jobId]){
		delete cron.jobTimers[jobId];
	    }
	}
	// reap freed job ID
	if (cron.nextJob > jobId){
	    cron.nextJob = jobId;
	}
    },

    parseInterval: function(s){
	var parts = s.split(":");
	var retval = 0;
	while (parts.length > 0){
	    retval *= 60;
	    retval += parseInt(parts.shift());
	}
	return retval;
    },

    formatInterval: function(i){
	var parts = [];
	while (i >= 60){
	    parts.unshift(i % 60);
	    i = Math.floor(i / 60);
	}
	parts.unshift(i);
	return parts.join(":");
    },

    listJobs: function(who){
	var countIds = [];
	var timedIds = [];

	for (var jobId in state.cron.countJobs){ countIds.push(jobId); }
	for (var jobId in state.cron.timedJobs){ timedIds.push(jobId); }
	countIds.sort();
	timedIds.sort();

	if (countIds.length > 0){
	    cron.write("Initiative-based jobs:", who, "", "CronD");
	    var idLen = ("" + countIds[countIds.length - 1]).length;
	    var listMsg = "";
	    for (var i = 0; i < countIds.length; i++){
		var idStr = "" + countIds[i];
		while (idStr.length < idLen){ idStr = " " + idStr; }
		listMsg += idStr + ": \"" + state.cron.countJobs[countIds[i]]['command'] + "\"";
		if (state.cron.countJobs[countIds[i]]['interval'] > 0){
		    listMsg += " (every " + state.cron.countJobs[countIds[i]]['interval'] + " rounds)";
		}
		listMsg += "\n";
	    }
	    cron.write(listMsg, who, "font-size: small; font-family: monospace", "CronD");
	}
	else{
	    cron.write("No initiative-based jobs scheduled", who, "", "CronD");
	}

	if (timedIds.length > 0){
	    cron.write("Timed jobs:", who, "", "CronD");
	    var idLen = ("" + timedIds[timedIds.length - 1]).length;
	    var listMsg = "";
	    for (var i = 0; i < timedIds.length; i++){
		var idStr = "" + timedIds[i];
		while (idStr.length < idLen){ idStr = " " + idStr; }
		listMsg += idStr + ": \"" + state.cron.timedJobs[timedIds[i]]['command'] + "\"";
		if (state.cron.timedJobs[timedIds[i]]['interval'] > 0){
		    listMsg += " (every " + cron.formatInterval(state.cron.timedJobs[timedIds[i]]['interval']) + ")";
		}
		listMsg += "\n";
	    }
	    cron.write(listMsg, who, "font-size: small; font-family: monospace", "CronD");
	}
	else{
	    cron.write("No timed jobs scheduled", who, "", "CronD");
	}
    },


    showHelp: function(who, cmd){
	var helpMsg = "";
	helpMsg += "Usage: " + cmd + " [options] command\n";
	helpMsg += "  or:  " + cmd + " -l\n";
	helpMsg += "  or:  " + cmd + " -R job_IDs\n";
	helpMsg += "In the first form, the specified command is scheduled to be run later.\n";
	helpMsg += "In the second form, all scheduled jobs are listed.\n";
	helpMsg += "In the third form, one or more scheduled jobs are removed.\n";
	cron.write(helpMsg, who, "", "CronD");
	helpMsg = "Options:\n";
	helpMsg += "  -h, --help:               display this help message\n";
	helpMsg += "  -r N, --rounds N          execute command in N rounds\n";
	helpMsg += "  -c N, --count N           execute command on initiative count N\n";
	helpMsg += "  -t T, --time T            execute command at time T (HH:MM:SS)\n";
	helpMsg += "  -a T, --after T           execute command after interval T (HH:MM:SS)\n";
	helpMsg += "  -i I, --interval I        repeat command every I rounds or time (HH:MM:SS)\n";
	helpMsg += "  -f USER, --from USER      execute command as specified user\n";
	helpMsg += "  -l, --list                list all scheduled jobs\n";
	helpMsg += "  -R, --remove              remove all specified jobs (separate IDs with spaces)\n";
	cron.write(helpMsg, who, "font-size: small; font-family: monospace", "CronD");
    },

    fixupCommand: function(cmd, inlineRolls){
	function replaceInlines(s){
	    if (!inlineRolls){ return s; }
	    var i = parseInt(s.substring(3, s.length - 2));
	    if ((i < 0) || (i >= inlineRolls.length) || (!inlineRolls[i]) || (!inlineRolls[i]['expression'])){ return s; }
	    return "[[" + inlineRolls[i]['expression'] + "]]";
	}
	return cmd.replace(/\$\[\[\d+\]\]/g, replaceInlines);
    },

    handleCronMessage: function(tokens, msg){
	if (tokens.length < 2){
	    return cron.showHelp(msg.who, tokens[0]);
	}
	var args = {};
	var getArg = null;
	var doList = false;
	var doRemove = false;
	var cmdArray = [];
	for (var i = 1; i < tokens.length; i++){
	    if (getArg){
		args[getArg] = tokens[i];
		getArg = null;
		continue;
	    }
	    switch(tokens[i]){
	    case "-r":
	    case "--rounds":
		getArg = 'rounds';
		break;
	    case "-c":
	    case "--count":
		getArg = 'count';
		break;
	    case "-t":
	    case "--time":
		getArg = 'time';
		break;
	    case "-a":
	    case "--after":
		getArg = 'after';
		break;
	    case "-i":
	    case "--interval":
		getArg = 'interval';
		break;
	    case "-f":
	    case "--from":
		getArg = 'from';
		break;
	    case "-l":
	    case "--list":
		doList = true;
		break;
	    case "-R":
	    case "--remove":
		doRemove = true;
		break;
	    case "-h":
	    case "--help":
		return cron.showHelp(msg.who, tokens[0]);
	    default:
		cmdArray.push(tokens[i]);
	    }
	}

	if (doList){
	    // list jobs
	    return cron.listJobs(msg.who);
	}

	if (doRemove){
	    // remove one or more jobs
	    if (cmdArray.length <= 0){
		cron.write("Error: No job IDs specified for remove command", msg.who, "", "CronD");
		return;
	    }
	    for (var i = 0; i < cmdArray.length; i++){
		cron.removeJob(parseInt(cmdArray[i]));
	    }
	    return;
	}

	// add a job
	var command = cron.fixupCommand(cmdArray.join(" "), msg.inlinerolls || []);
	if (!command){
	    cron.write("Error: No command specified for execution", msg.who, "", "CronD");
	    return;
	}
	if (msg.rolltemplate){
	    command = "&{template:" + msg.rolltemplate + "} " + command;
	}
	// determine whether new job is initiative-based or timed
	var doCount = false;
	var doTimed = false;
	if ((args['rounds']) || (args['count'])){
	    doCount = true;
	    args['rounds'] = (args['rounds'] ? parseInt(args['rounds']) : 0);
	    if (args['count']){
		args['count'] = parseInt(args['count']);
	    }
	    else{
		// no count specified; get current count from turnorder
		var turns = JSON.parse(Campaign().get('turnorder') || "[]");
		args['count'] = (turns.length > 0 ? turns[0].pr : 0);
	    }
	}
	if ((args['time']) || (args['after'])){
	    doTimed = true;
	    var d = new Date();
	    var dv = d.valueOf();
	    if (args['time']){
		if (args['after']){
		    cron.write("Warning: Cannot specify both time and after arguments; ignoring after", msg.who, "", "CronD");
		}
		var tokens = args['time'].split(":").map(function(t){ return parseInt(t || "0"); });
		while (tokens.length < 3){ tokens.push(0); }
		d.setUTCHours(tokens[0], tokens[1], tokens[2]);
		if (d.valueOf() <= dv){
		    // specified time is in the past; add 24 hours so it's in the future
		    d.setTime(d.valueOf() + 24 * 60 * 60 * 1000);
		}
	    }
	    else{
		d.setTime(dv + cron.parseInterval(args['after']) * 1000);
	    }
	    args['time'] = d.valueOf();
	}
	if (args['interval']){
	    if ((!doCount) && (!doTimed)){
		// no args explicitly specify whether job is initiative-based or timed; try to figure out from interval
		if (args['interval'].indexOf(":") >= 0){ doTimed = true; }
		else{ doCount = true; }
	    }
	    args['interval'] = cron.parseInterval(args['interval']);
	    if (doCount){
		if (!args.hasOwnProperty('rounds')){
		    args['rounds'] = args['interval'];
		}
		if (!args.hasOwnProperty('count')){
		    var turns = JSON.parse(Campaign().get('turnorder') || "[]");
		    args['count'] = (turns.length > 0 ? turns[0].pr : 0);
		}
	    }
	}
	if ((doCount) && (doTimed)){
	    cron.write("Error: Cannot mix initiative-based and timed jobs", msg.who, "", "CronD");
	    return;
	}
	if ((!doCount) && (!doTimed)){
	    // command didn't specify when to execute job; fail
	    cron.write("Error: Must specify some job condition (at least one of rounds, count, time, after, or interval)", msg.who, "", "CronD");
	    return;
	}
	if (doCount){
	    cron.addCountJob(command, args['from'], args['count'], args['rounds'], args['interval'] || 0);
	}
	if (doTimed){
	    cron.addTimedJob(command, args['from'], args['time'], args['interval'] || 0);
	}
    },

    handleChatMessage: function(msg){
	if ((msg.type != "api") || (msg.content.indexOf("!cron") != 0)){ return; }

	return cron.handleCronMessage(msg.content.split(" "), msg);
    },

    registerCron: function(){
	cron.init();
	on("change:campaign:turnorder", cron.handleTurnChange);
	if ((typeof(Shell) != "undefined") && (Shell) && (Shell.registerCommand)){
	    Shell.registerCommand("!cron", "!cron [options] command", "Schedule a command to run in the future", cron.handleCronMessage);
	    if (Shell.write){
		cron.write = Shell.write;
	    }
	}
	else{
	    on("chat:message", cron.handleChatMessage);
	}
    }
};

on("ready", function(){ cron.registerCron(); });
