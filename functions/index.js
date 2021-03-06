//import
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const serviceAccount = require('./atcontributter-firebase-adminsdk-5p86i-6e55085ef8.json');
const axios = require('axios');
const twitter = require('twitter');
const cors = require('cors')({ origin: true });
const decycle = require('json-decycle').decycle;
const retrocycle = require('json-decycle').retrocycle;

//initialize
const adminConfig = JSON.parse(process.env.FIREBASE_CONFIG);
adminConfig.credential = admin.credential.cert(serviceAccount);
admin.initializeApp(adminConfig);

//create instance
const firestore = admin.firestore();
const bucket = admin.storage().bucket();

//global
let consumerKey;
let consumerKeySecret;
let accessToken;
let accessTokenSecret;
let receiveAc;
let receiveNewAcString;
let receiveNewAc;
let senderAc;
let uploadPath;
let problemCount;
let newProblemCount;

//main
exports.devotterCronJob = functions.region('asia-northeast1').https.onRequest(async (request, response) => {
    cors(request, response, () => {
        response.set('Access-Control-Allow-Origin', 'http://localhost:5000');
        response.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST');
        response.set('Access-Control-Allow-Headers', 'Content-Type');
    });
    try {
        //firebase storageから昨日のAtCoderAC情報が入ったjsonを取得する
        const receiveJson = await bucket.file('ac.json').download();
        receiveAc = JSON.parse(receiveJson);

        //kenkooooさんのAtCoderAPIを使って本日のAtCoderAC情報をaxiosで取得
        const receiveNewJson = await axios.get('https://kenkoooo.com/atcoder/resources/ac.json', { headers: { 'accept-encoding': 'gzip' } });
        receiveNewAcString = JSON.stringify(receiveNewJson, decycle());
        receiveNewAc = JSON.parse(receiveNewAcString, retrocycle()).data;

        //firestoreからtwitter apiのconsumerKeyとconsumerKeySecretを取得
        const getConsumerKeyQuerySnapShot = await firestore.collection('api').doc('keys').get();
        consumerKey = getConsumerKeyQuerySnapShot.data().consumerKey;
        consumerKeySecret = getConsumerKeyQuerySnapShot.data().consumerKeySecret;

        //firestoreからツイートに必要なユーザー情報を取得
        const getUserDataQuerySnapShot = await firestore.collection('users').get();
        getUserDataQuerySnapShot.forEach(async document => {
            try {
                //取得したUserQuerySnapShotからaccessTokenとaccessTokenSecretを取得
                const getAcceseTokenQuerySnapShot = await firestore.collection('users').doc(document.id).get();
                accessToken = getAcceseTokenQuerySnapShot.data().accessToken;
                accessTokenSecret = getAcceseTokenQuerySnapShot.data().accessTokenSecret;

                //昨日のjsonデータ中のfirestoreに登録しているユーザーのAC数を抽出
                for (const element in receiveAc) {
                    if (receiveAc[element].user_id === document.id) {
                        problemCount = receiveAc[element].problem_count;
                        break;
                    }
                }

                //今日のjsonデータ中のfirestoreに登録しているユーザーのAC数を抽出
                for (const element in receiveNewAc) {
                    if (receiveNewAc[element].user_id === document.id) {
                        newProblemCount = receiveNewAc[element].problem_count;
                        break;
                    }
                }

                //twitterクライアントにkeyを登録
                const client = new twitter({
                    consumer_key: consumerKey,
                    consumer_secret: consumerKeySecret,
                    access_token_key: accessToken,
                    access_token_secret: accessTokenSecret
                });

                //twitter apiを使ってツイート
                let tweetMessage = '今日の' + document.id + 'さんのAC数は' + (newProblemCount - problemCount) + 'でした。\n#devotter'
                client.post('statuses/update', {
                    status: tweetMessage
                }, (error) => {
                    if (!error) {
                        response.status(200).send('success!');
                    }
                    else {
                        response.status(500).send(error);
                    }
                });

                //今日取得したAC数をfirebase storageにアップロード
                senderAc = JSON.stringify(receiveNewAc);
                uploadPath = 'ac.json';
                bucket.file(uploadPath).save(senderAc);
            }
            catch (error) {
                response.status(500).send(error);
            }
        });
    }
    catch (error) {
        response.status(500).send(error);
    }
});
