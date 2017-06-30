import Rx from 'rxjs/Rx';
import R from 'ramda';
import BroidSlack from 'broid-slack';
import MessageBuilder from './MessageBuilder';
import Navitia from './lib/navitia';
import Router from './router/router';

const clients = {
    slack: new BroidSlack({
        token: 'xoxb-204765474528-UMGOH29DvI8enVN3xb1XdjfV',
        http: {
            host: '127.0.0.1',
            port: 8080,
        }
    })
};

let formatDatetime = function(datetime) {
    if (typeof datetime !== 'string') { return 'none'; }
    var formated = datetime.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,
                                    '$4:$5');
    if (formated.slice(-2) === '00') {
        return formated.slice(0, -3);
    } else {
        return formated;
    }
};

Rx.Observable.merge(...R.map(client => client.connect(), R.values(clients))).subscribe({
    next: data => console.log(JSON.stringify(data, null, 2)),
    error: err => console.error(`Something went wrong: ${err.message}`),
});

Rx.Observable.merge(...R.map(client => client.listen(), R.values(clients))).subscribe({
    next: message => {
        const messageType = R.path(['object', 'type'], message);
        const messageBody = R.path(['object', 'content'], message);
        const senderType = R.path(['actor', 'type'], message);
        const generatorName = R.path(['generator', 'name'], message);

        if (messageType === 'Note' && senderType === 'Person') {
            const navitia = new Navitia('5c60fc34-e017-4c9e-9744-13515c6436d8');

            Router('prochain(?:s)? (.*)? (?:de|à|pour) (.*)', messageBody, (type, origin) => {
                console.log("type", type);
                console.log("origin", origin);

                if (type.match(new RegExp('train(s)?|rer', 'gi'))) {
                    physical_modes.push('physical_mode:Train', 'physical_mode:RapidTransit');
                }
                if (type.match(new RegExp('métro(s)?', 'gi'))) {
                    physical_modes.push('physical_mode:Metro');
                }
                if (type.match(new RegExp('bus', 'gi'))) {
                    physical_modes.push('physical_mode:Bus');
                }

                navitia.getFirstPlace(origin, ["stop_area"])
                    .then(place => {
                        navitia.getDepartures(place.id)
                            .then(departuresResponse => {
                                let replyMessage = `Prochains passages à ${place.name}\n`;
                                departuresResponse.departures.forEach(departure => {
                                    let physical_mode;
                                    departure.links.forEach(link => {
                                        if (link.type == 'physical_mode') {
                                            physical_mode = link.id;
                                        }
                                    });
                                    replyMessage += `${formatDatetime(departure.stop_date_time.departure_date_time)} - ${getPicto(physical_mode)} \`${departure.display_informations.code}\` en direction de ${departure.display_informations.direction}\n`;
                                });
                                const reply = MessageBuilder.getReply(replyMessage, message);
                                clients[generatorName].send(reply)
                                    .then(console.log)
                                    .catch(console.error);
                            })
                            .catch(result => {
                                const reply = MessageBuilder.getReply(`Aucun horaire trouvé pour l'arrêt ${place.name}`, message);
                                clients[generatorName].send(reply)
                                    .then(console.log)
                                    .catch(console.error);
                            });
                    })
                    .catch(result => {
                        const reply = MessageBuilder.getReply(`Désolé je connais pas ${origin}`, message);
                        clients[generatorName].send(reply)
                            .then(console.log)
                            .catch(console.error);
                    });
            });

            Router('Dernier départ vers (.*)', messageBody, (destination) => {
                navitia.getFirstPlace(destination)
                    .then(place => {
                        let date = new Date();
                        if (date.getHours() > 5) {
                            date.setDate(date.getDate() + 1);
                        }
                        date.setHours(5);
                        date.setMinutes(0);
                        date.setSeconds(0);
                        navitia.getJourneys('stop_area:OIF:SA:8768600', place.id, date)
                            .then(results => {
                                const lastDeparture = formatDatetime(results.journeys[0].departure_date_time);
                                const reply = MessageBuilder.getReply(":steam_locomotive: Faudra pas se louper, le dernier départ vers " + place.name + " est à :clock5: " + lastDeparture, message);
                                clients[generatorName].send(reply)
                                    .then(console.log)
                                    .catch(console.error);
                            })
                            .catch(result => {
                                console.log("No result bitch !!");
                            });
                    })
                    .catch(result => {
                        const reply = MessageBuilder.getReply("Désolé je connais pas " + destination, message);
                        clients[generatorName].send(reply)
                            .then(console.log)
                            .catch(console.error);
                    });
            });
        }
    },
    error: err => console.error(`Something went wrong: ${err.message}`),
});

function getPicto(physical_mode) {
    switch (physical_mode) {
        case 'physical_mode:Bus':
            return ':bus:';
        case 'physical_mode:Metro':
            return ':metro:';
        case 'physical_mode:Train':
            return ':steam_locomotive:';
        case 'physical_mode:RapidTransit':
            return ':light_rail:';
        case 'physical_mode:Tramway':
            return ':tram:';
        case 'physical_mode:Car':
            return ':car:';
        case 'physical_mode:Bike':
        case 'physical_mode:BikeSharingService':
            return ':bike:';
    }
}