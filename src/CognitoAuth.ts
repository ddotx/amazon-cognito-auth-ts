/*!
  * Amazon Cognito Auth SDK for JavaScript
  * Copyright 2017 Amazon.com, Inc. or its affiliates. All Rights Reserved.
  *
  * Licensed under the Apache License, Version 2.0 (the "License").
  * You may not use this file except in compliance with the License.
  * A copy of the License is located at
  *
  *         http://aws.amazon.com/apache2.0/
  *
  * or in the "license" file accompanying this file.
  * This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES
  * OR CONDITIONS OF ANY KIND, either express or implied. See the
  * License for the specific language governing permissions
  * and limitations under the License.
  */

import CognitoTokenScopes from './CognitoTokenScopes';
import CognitoToken from './CognitoToken';
import CognitoRefreshToken from './CognitoRefreshToken';
import CognitoAuthSession, { CognitoSessionData } from './CognitoAuthSession';
import StorageHelper from './StorageHelper';
import CognitoConstants from './CognitoConstants';
import { launchUri } from './UriHelper';
//import CognitoAuthPromisesCode from "./CognitoAuthPromisesCode";
//import CognitoAuthPromisesToken from "./CognitoAuthPromisesToken";
//import CognitoAuthToken from "./CognitoAuthToken";
//import CognitoAuthCode from "./CognitoAuthCode";
declare var AmazonCognitoAdvancedSecurityData: any;
declare var XDomainRequest: any;


export interface CognitoAuthOptions {
    /**
     * Required: User pool application client id.
     */
    ClientId: string;

    /**
     * Required: The application/user-pools Cognito web hostname,this is set at the Cognito console.
     */
    AppWebDomain: string;

    /**
     * Optional: The token scopes
     */
    TokenScopesArray?: ReadonlyArray<string>;

    /**
     * Required: Required: The redirect Uri, which will be launched after authentication as signed in.
     */
    RedirectUriSignIn: string;

    /**
     * Required: The redirect Uri, which will be launched when signed out.
     */
    RedirectUriSignOut: string;

    /**
     * Optional: Pre-selected identity provider (this allows to automatically trigger social provider authentication flow).
     */
    IdentityProvider?: string;

    /**
     * Optional: UserPoolId for the configured cognito userPool.
     */
    UserPoolId?: string;

    /**
     * Optional: boolean flag indicating if the data collection is enabled to support cognito advanced security features. By default, this flag is set to true.
     */
    AdvancedSecurityDataCollectionFlag?: boolean;

    /**
     * Optional: e.g. new CookieStorage(), to use the specified storage provided
     */
    Storage: any,

    /**
     * data.LaunchUri Optional: Function to open a url, by default uses window.open in browser, Linking.openUrl in React Native
     */
    LaunchUri?: (url: any) => any
}

interface CognitoAuthUserHandler {
    onSuccess: (authSession: CognitoAuthSession) => void;
    onFailure: (err: any) => void;
}

/** @class */
export default class CognitoAuth {

    username: string;
    clientId: string;
    appWebDomain: string;
    tokenScopesArray: ReadonlyArray<string>;
    protected redirectUriSignIn: string;
    redirectUriSignOut: string;
    identityProvider: string;
    userPoolId: string;
    advancedSecurityDataCollectionFlag?: boolean;
    storage: any;
    protected signInUserSession: CognitoAuthSession;
    state: any;
    userhandler: CognitoAuthUserHandler;
    responseType: string;

    /**
     * Constructs a new CognitoAuth object
     * @param {object} data Creation options
     * @param {string} data.ClientId Required: User pool application client id.
     * @param {string} data.AppWebDomain Required: The application/user-pools Cognito web hostname,
     *                     this is set at the Cognito console.
     * @param {array} data.TokenScopesArray Optional: The token scopes
     * @param {string} data.RedirectUriSignIn Required: The redirect Uri,
     * which will be launched after authentication as signed in.
     * @param {string} data.RedirectUriSignOut Required:
     * The redirect Uri, which will be launched when signed out.
     * @param {string} data.IdentityProvider Optional: Pre-selected identity provider (this allows to
     * automatically trigger social provider authentication flow).
     * @param {string} data.UserPoolId Optional: UserPoolId for the configured cognito userPool.
     * @param {boolean} data.AdvancedSecurityDataCollectionFlag Optional: boolean flag indicating if the
     *        data collection is enabled to support cognito advanced security features. By default, this
     *        flag is set to true.
     * @param {nodeCallback<CognitoAuthSession>} Optional: userhandler Called on success or error.
     */
    constructor(data: CognitoAuthOptions, implicitFlow: boolean = true) {
        const { ClientId, AppWebDomain, TokenScopesArray,
            RedirectUriSignIn, RedirectUriSignOut, IdentityProvider, UserPoolId,
            AdvancedSecurityDataCollectionFlag, Storage, LaunchUri } = data;
        if (data == null || !ClientId || !AppWebDomain || !RedirectUriSignIn || !RedirectUriSignOut) {
            throw new Error(CognitoConstants.PARAMETERERROR);
        }

        this.clientId = ClientId;
        this.appWebDomain = AppWebDomain;
        this.tokenScopesArray = TokenScopesArray || [];
        if (!Array.isArray(TokenScopesArray)) {
            throw new Error(CognitoConstants.SCOPETYPEERROR);
        }
        const tokenScopes = new CognitoTokenScopes(this.tokenScopesArray);
        this.redirectUriSignIn = RedirectUriSignIn;
        this.redirectUriSignOut = RedirectUriSignOut;
        this.identityProvider = IdentityProvider;
        this.responseType = implicitFlow ? CognitoConstants.TOKEN : CognitoConstants.CODE;
        this.storage = Storage || new StorageHelper().getStorage();
        this.launchUri = typeof LaunchUri === 'function' ? LaunchUri : launchUri;
        this.username = this.getLastUser();
        this.userPoolId = UserPoolId;
        this.signInUserSession = this.getCachedSession();
        +     this.signInUserSession.setTokenScopes(tokenScopes);

        /**
         * By default, AdvancedSecurityDataCollectionFlag is set to true, if no input value is provided.
         */
        this.advancedSecurityDataCollectionFlag = Boolean(AdvancedSecurityDataCollectionFlag);
    }

    protected getUserhandler() {
        return this.userhandler;
    }

    protected getRedirectUriSignIn() {
        return this.redirectUriSignIn;
    }

    /**
     * @returns {string} the client id
     */
    getClientId(): string {
        return this.clientId;
    }

    /**
     * @returns {string} the app web domain
     */
    getAppWebDomain(): string {
        return this.appWebDomain;
    }

    /**
     * method for getting the current user of the application from the local storage
     *
     * @returns {CognitoAuth} the user retrieved from storage
     */
    getCurrentUser(): string {
        const lastUserKey = `CognitoIdentityServiceProvider.${this.clientId}.LastAuthUser`;

        const lastAuthUser = this.storage.getItem(lastUserKey);
        return lastAuthUser;
    }

    /**
     * @param {string} Username the user's name
     * method for setting the current user's name
     * @returns {void}
     */
    setUser(username: string) {
        this.username = username;
    }

    /**
     * sets response type to 'code'
     * @returns {void}
     */
    useCodeGrantFlow() {
        this.responseType = CognitoConstants.CODE;
    }

    /**
     * sets response type to 'token'
     * @returns {void}
     */
    useImplicitFlow() {
        this.responseType = CognitoConstants.TOKEN;
    }

    setIdentityProvider(identityProvider: string) {
        this.identityProvider = identityProvider;
    }

    /**
     * @returns {CognitoAuthSession} the current session for this user
     */
    getSignInUserSession(): CognitoAuthSession {
        return this.signInUserSession;
    }

    /**
     * @returns {string} the user's username
     */
    getUsername(): string {
        return this.username;
    }

    /**
     * @param {string} Username the user's username
     * @returns {void}
     */
    setUsername(username: string) {
        this.username = username;
    }

    /**
     * @returns {string} the user's state
     */
    getState(): string {
        return this.state;
    }

    /**
     * @param {string} State the user's state
     * @returns {void}
     */
    setState(state: string) {
        this.state = state;
    }

    /**
     * This is used to get a session, either from the session object
     * or from the local storage, or by using a refresh token
     * @param {string} RedirectUriSignIn Required: The redirect Uri,
     * which will be launched after authentication.
     * @param {array} TokenScopesArray Required: The token scopes, it is an
     * array of strings specifying all scopes for the tokens.
     * @returns {void}
     */
    public getSession(): Promise<CognitoAuthSession> {
        const tokenScopesInputSet = new Set(this.tokenScopesArray);
        const cachedScopesSet = new Set(this.signInUserSession.tokenScopes.getScopes()); //TODO why here?
        const URL = this.getFQDNSignIn();
        if (this.signInUserSession != null && this.signInUserSession.isValid()) {
            if (this.userhandler) {
                this.userhandler.onSuccess(this.signInUserSession);
            }
            return Promise.resolve(this.signInUserSession);
        }
        this.signInUserSession = this.getCachedSession(); //TODO? const cachedScopesSet = new Set(this.signInUserSession.tokenScopes.getScopes());
        // compare scopes
        if (!this.compareSets(tokenScopesInputSet, cachedScopesSet)) {
            const tokenScopes = new CognitoTokenScopes(this.tokenScopesArray);
            const idToken = new CognitoToken();
            const accessToken = new CognitoToken();
            const refreshToken = new CognitoRefreshToken();
            this.signInUserSession.setTokenScopes(tokenScopes);
            this.signInUserSession.setIdToken(idToken);
            this.signInUserSession.setAccessToken(accessToken);
            this.signInUserSession.setRefreshToken(refreshToken);
            this.launchUri(URL);
        } else if (this.signInUserSession.isValid()) {
            if (this.userhandler) {
                this.userhandler.onSuccess(this.signInUserSession);
            }
            return Promise.resolve(this.signInUserSession);
        } else if (!this.signInUserSession.getRefreshToken()
            || !this.signInUserSession.getRefreshToken().getToken()) {
            this.launchUri(URL);
        } else {
            return this.refreshSession(this.signInUserSession.getRefreshToken().getToken()).then(data => {
                if (this.userhandler) {
                    this.userhandler.onSuccess(this.signInUserSession);
                }
                return this.signInUserSession
            }
            );
        }
        if (this.userhandler) {
            this.userhandler.onSuccess(undefined);
        }
        return Promise.resolve(undefined);
    }

    /**
     * @param {string} httpRequestResponse the http request response
     * @returns {void}
     * Parse the http request response and proceed according to different response types.
     */
    parseCognitoWebResponse(httpRequestResponse: string): Promise<CognitoAuthSession> {
        const parsePromise = this.responseType === CognitoConstants.TOKEN ?
            this.parseCognitoToken(httpRequestResponse) : this.parseCognitoCode(httpRequestResponse);
        return parsePromise.then(data => {
            const result = this.resolveCognitoAuthSession(data);
            if (this.userhandler) this.userhandler.onSuccess(result);
            return result;
        }).catch(e => {
            if (this.userhandler) {
                this.userhandler.onFailure(e)
                return undefined;
            } else {
                throw e;
            }
        });
    }

    private parseCognitoToken(httpRequestResponse: string): Promise<Map<string, string>> {
        const map = this.getQueryParameters(
            httpRequestResponse,
            CognitoConstants.QUERYPARAMETERREGEX1
        );
        return Promise.resolve(map);
    }

    private parseCognitoCode(httpRequestResponse: string): Promise<Map<string, string>> {
        // this is to avoid a bug exists when sign in with Google or facebook
        // Sometimes the code will contain a poundsign in the end which breaks the parsing
        const response = (httpRequestResponse.split(CognitoConstants.POUNDSIGN))[0];
        const map = this.getQueryParameters(
            response,
            CognitoConstants.QUESTIONMARK
        );
        if (map.has(CognitoConstants.ERROR)) {
            throw new Error(CognitoConstants.PARSETYPEERROR);
        }
        if (map.has(CognitoConstants.STATE)) {
            this.signInUserSession.setState(map.get(CognitoConstants.STATE));
        } else {
            this.signInUserSession.setState(null);
        }

        if (map.has(CognitoConstants.CODE)) {
            // if the response contains code
            // To parse the response and get the code value.
            const codeParameter = map.get(CognitoConstants.CODE);
            const body = {
                grant_type: CognitoConstants.AUTHORIZATIONCODE,
                code: codeParameter
            };
            return this.makePostCode(body);
        }
    }

    private makePostCode(bodyOption: any): Promise<Map<string, string>> {

        const url = this.getUrlToken();
        const header = CognitoConstants.HEADER;
        const body = {
            ...bodyOption,
            client_id: this.getClientId(),
            redirect_uri: this.getRedirectUriSignIn(),
        };
        return this.makePOSTRequest(header, body, url).then(data => {
            return new Map(Object.entries(JSON.parse(data)));
        });
    }

    private getUrlToken() {
        return CognitoConstants.DOMAIN_SCHEME.concat(
            CognitoConstants.COLONDOUBLESLASH, this.getAppWebDomain(),
            CognitoConstants.SLASH, CognitoConstants.DOMAIN_PATH_TOKEN);
    }

    resolveCognitoAuthSession(map: Map<string, string>): CognitoAuthSession {
        const idToken = new CognitoToken();
        const accessToken = new CognitoToken();
        const refreshToken = new CognitoRefreshToken();
        if (map.has(CognitoConstants.ERROR)) {
            throw new Error(CognitoConstants.PARSETYPEERROR);
        }
        if (map.has(CognitoConstants.IDTOKEN)) {
            this.signInUserSession.setIdToken(new CognitoToken(map.get(CognitoConstants.IDTOKEN)));
        } else {
            this.signInUserSession.setIdToken(idToken);
        }
        if (map.has(CognitoConstants.ACCESSTOKEN)) {
            this.signInUserSession.setAccessToken(new CognitoToken(map.get(CognitoConstants.ACCESSTOKEN)));
        } else {
            this.signInUserSession.setAccessToken(accessToken);
        }
        if (map.has(CognitoConstants.STATE)) {
            this.signInUserSession.setState(map.get(CognitoConstants.STATE));
        } else {
            this.signInUserSession.setState(null);
        }
        if (map.has(CognitoConstants.REFRESHTOKEN)) {
            this.signInUserSession.setRefreshToken(new CognitoRefreshToken(map.get(CognitoConstants.REFRESHTOKEN)));
        } else {
            this.signInUserSession.setRefreshToken(refreshToken);
        }
        this.cacheTokensScopes();
        return this.signInUserSession;
        //this.userhandler.onSuccess(this.signInUserSession);
    }


    /**
     * Get cached tokens and scopes and return a new session using all the cached data.
     * @returns {CognitoAuthSession} the auth session
     */
    getCachedSession(): CognitoAuthSession {
        if (!this.username) {
            return new CognitoAuthSession();
        }
        const keyPrefix = `CognitoIdentityServiceProvider.${this.getClientId()}.${this.username}`;
        const idTokenKey = `${keyPrefix}.idToken`;
        const accessTokenKey = `${keyPrefix}.accessToken`;
        const refreshTokenKey = `${keyPrefix}.refreshToken`;
        const scopeKey = `${keyPrefix}.tokenScopesString`;

        const scopesString = this.storage.getItem(scopeKey);
        let scopesArray: [] = [];
        if (scopesString) {
            scopesArray = scopesString.split(' ');
        }
        const tokenScopes = new CognitoTokenScopes(scopesArray);
        const idToken: CognitoToken = new CognitoToken(this.storage.getItem(idTokenKey));
        const accessToken = new CognitoToken(this.storage.getItem(accessTokenKey));
        const refreshToken = new CognitoRefreshToken(this.storage.getItem(refreshTokenKey));

        const sessionData: CognitoSessionData = {
            IdToken: idToken,
            AccessToken: accessToken,
            RefreshToken: refreshToken,
            TokenScopes: tokenScopes,
        };
        const cachedSession = new CognitoAuthSession(sessionData);
        return cachedSession;
    }

    /**
     * This is used to get last signed in user from local storage
     * @returns {string} the last user name
     */
    getLastUser(): string {
        const keyPrefix = `CognitoIdentityServiceProvider.${this.getClientId()}`;
        const lastUserKey = `${keyPrefix}.LastAuthUser`;
        const lastUserName = this.storage.getItem(lastUserKey);
        if (lastUserName) {
            return lastUserName;
        }
        return undefined;
    }

    /**
     * This is used to save the session tokens and scopes to local storage
     * Input parameter is a set of strings.
     * @returns {void}
     */
    cacheTokensScopes(): void {
        const keyPrefix = `CognitoIdentityServiceProvider.${this.getClientId()}`;
        const tokenUserName = this.signInUserSession.getAccessToken().getUsername();
        this.username = tokenUserName;
        const idTokenKey = `${keyPrefix}.${tokenUserName}.idToken`;
        const accessTokenKey = `${keyPrefix}.${tokenUserName}.accessToken`;
        const refreshTokenKey = `${keyPrefix}.${tokenUserName}.refreshToken`;
        const lastUserKey = `${keyPrefix}.LastAuthUser`;
        const scopeKey = `${keyPrefix}.${tokenUserName}.tokenScopesString`;
        const scopesArray = this.signInUserSession.getTokenScopes().getScopes();
        const scopesString = scopesArray.join(' ');
        this.storage.setItem(idTokenKey, this.signInUserSession.getIdToken().getJwtToken());
        this.storage.setItem(accessTokenKey, this.signInUserSession.getAccessToken().getJwtToken());
        this.storage.setItem(refreshTokenKey, this.signInUserSession.getRefreshToken().getToken());
        this.storage.setItem(lastUserKey, tokenUserName);
        this.storage.setItem(scopeKey, scopesString);
    }

    /**
     * Compare two sets if they are identical.
     * @param {set} set1 one set
     * @param {set} set2 the other set
     * @returns {boolean} boolean value is true if two sets are identical
     */
    compareSets(set1, set2): boolean {
        if (set1.size !== set2.size) {
            return false;
        }
        for (const item of set1) {
            if (!set2.has(item)) {
                return false;
            }
        }
        return true;
    }

    /**
     * @param {string} url the url string
     * Get the hostname from url.
     * @returns {string} hostname string
     */
    getHostName(url: string): string {
        const match = url.match(CognitoConstants.HOSTNAMEREGEX);
        if (match != null && match.length > 2 && typeof match[2] ===
            CognitoConstants.STRINGTYPE && match[2].length > 0) {
            return match[2];
        }
        return undefined;
    }

    /**
     * Get http query parameters and return them as a map.
     * @param {string} url the url string
     * @param {string} splitMark query parameters split mark (prefix)
     * @returns {map} map
     */
    getQueryParameters(url: string, splitMark: string | RegExp) {
        const str = String(url).split(splitMark);
        const url2 = str[1];
        const str1: any = String(url2).split(CognitoConstants.AMPERSAND);
        const num = str1.length;
        const map = new Map();
        let i;
        for (i = 0; i < num; i++) {
            str1[i] = String(str1[i]).split(CognitoConstants.QUERYPARAMETERREGEX2);
            map.set(str1[i][0], str1[i][1]);
        }
        return map;
    }

    /**
     * helper function to generate a random string
     * @param {int} length the length of string
     * @param {string} chars a original string
     * @returns {string} a random value.
     */
    generateRandomString(length: number, chars: string): string {
        let result = '';
        let i = length;
        for (; i > 0; --i) result += chars[Math.round(Math.random() * (chars.length - 1))];
        return result;
    }

    /**
     * This is used to clear the session tokens and scopes from local storage
     * @returns {void}
     */
    clearCachedTokensScopes(): void {
        const keyPrefix = `CognitoIdentityServiceProvider.${this.getClientId()}`;
        const idTokenKey = `${keyPrefix}.${this.username}.idToken`;
        const accessTokenKey = `${keyPrefix}.${this.username}.accessToken`;
        const refreshTokenKey = `${keyPrefix}.${this.username}.refreshToken`;
        const lastUserKey = `${keyPrefix}.LastAuthUser`;
        const scopeKey = `${keyPrefix}.${this.username}.tokenScopesString`;

        this.storage.removeItem(idTokenKey);
        this.storage.removeItem(accessTokenKey);
        this.storage.removeItem(refreshTokenKey);
        this.storage.removeItem(lastUserKey);
        this.storage.removeItem(scopeKey);
    }

    /**
     * This is used to build a user session from tokens retrieved in the authentication result
     * @param {object} refreshToken authResult Successful auth response from server.
     * @returns {void}
     */
    refreshSession(refreshToken): Promise<CognitoAuthSession> {
        if (this.responseType === CognitoConstants.TOKEN) {
            if (this.userhandler) {
                this.userhandler.onFailure(CognitoConstants.REFRESHTYPEERROR);
                return undefined;
            } else {
                return Promise.reject(CognitoConstants.REFRESHTYPEERROR);
            }
            //TODO Login again?
        }
        else {
            return this.makePostCode({
                grant_type: CognitoConstants.REFRESHTOKEN,
                refresh_token: refreshToken
            }).then(map => {
                if (map.has(CognitoConstants.ERROR)) {
                    const URL = this.getFQDNSignIn();
                    this.launchUri(URL);
                    throw new Error(CognitoConstants.REFRESHTYPEERROR);
                } else {
                    if (map.has(CognitoConstants.IDTOKEN)) {
                        this.signInUserSession.setIdToken(new CognitoToken(map.get(CognitoConstants.IDTOKEN)));
                    }
                    if (map.has(CognitoConstants.ACCESSTOKEN)) {
                        this.signInUserSession.setAccessToken(new CognitoToken(map.get(CognitoConstants.ACCESSTOKEN)));
                    }
                    this.cacheTokensScopes();
                    if (this.userhandler) {
                        this.userhandler.onSuccess(this.signInUserSession);
                    }
                    return this.signInUserSession;
                }
            }).catch(e => {
                if (this.userhandler) {
                    this.userhandler.onFailure(e)
                    return undefined;
                } else {
                    throw e;
                }
            });
        }
    }

    /**
     * Make the http POST request.
     * @param {JSON} header header JSON object
     * @param {JSON} body body JSON object
     * @param {string} url string
     * @param {function} onSuccess callback
     * @param {function} onFailure callback
     * @returns {void}
     */
    makePOSTRequest(header, body, url): Promise<string> {
        // This is a sample server that supports CORS.
        return new Promise((resolve, reject) => {
            const xhr = this.createCORSRequest(CognitoConstants.POST, url);
            let bodyString = '';
            if (!xhr) {
                return;
            }
            // set header
            for (let key in header) {
                xhr.setRequestHeader(key, header[key]);
            }
            for (let key in body) {
                bodyString = bodyString.concat(key, CognitoConstants.EQUALSIGN,
                    body[key], CognitoConstants.AMPERSAND);
            }
            bodyString = bodyString.substring(0, bodyString.length - 1);
            xhr.send(bodyString);
            xhr.onreadystatechange = function addressState() {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        resolve(xhr.responseText)
                    } else {
                        reject(xhr.responseText)
                    }
                }
            };
        })
    }

    /**
     * Create the XHR object
     * @param {string} method which method to call
     * @param {string} url the url string
     * @returns {object} xhr
     */
    createCORSRequest(method, url) {
        let xhr = new XMLHttpRequest();
        //xhr.open(method, url, true);
        if (CognitoConstants.WITHCREDENTIALS in xhr) {
            // XHR for Chrome/Firefox/Opera/Safari.
            xhr.open(method, url, true);
        } else if (typeof XDomainRequest !== CognitoConstants.UNDEFINED) {
            // XDomainRequest for IE.
            xhr = new XDomainRequest();
            xhr.open(method, url);
        } else {
            // CORS not supported.
            xhr = null;
        }
        return xhr;
    }

    /**
     * The http POST request onFailure callback.
     * @param {object} err the error object
     * @returns {function} onFailure
     */
    onFailure(err) {
        this.userhandler.onFailure(err);
    }

    /**
     * The http POST request onSuccess callback when refreshing tokens.
     * @param {JSON} jsonData tokens
     */
    async onSuccessRefreshToken(jsonData) {
        const jsonDataObject = JSON.parse(jsonData);
        if (Object.prototype.hasOwnProperty.call(jsonDataObject,
            CognitoConstants.ERROR)) {
            const URL = this.getFQDNSignIn();
            this.launchUri(URL);
        } else {
            if (Object.prototype.hasOwnProperty.call(jsonDataObject,
                CognitoConstants.IDTOKEN)) {
                this.signInUserSession.setIdToken(new
                    CognitoToken(jsonDataObject.id_token));
            }
            if (Object.prototype.hasOwnProperty.call(jsonDataObject,
                CognitoConstants.ACCESSTOKEN)) {
                this.signInUserSession.setAccessToken(new
                    CognitoToken(jsonDataObject.access_token));
            }
            this.cacheTokensScopes();
            return this.signInUserSession;
            //this.userhandler.onSuccess(this.signInUserSession);
        }
    }


    /**
     * Launch Cognito Auth UI page.
     * @param {string} URL the url to launch
     * @returns {void}
     */
    launchUri(URL: string) { }

    /**
     * @returns {string} scopes string
     */
    getSpaceSeperatedScopeString(): string {
        const tokenScopes = this.signInUserSession.getTokenScopes().getScopes();
        const tokenScopesString = tokenScopes.join(CognitoConstants.SPACE);
        return encodeURIComponent(tokenScopesString);
    }

    /**
     * Create the FQDN(fully qualified domain name) for authorization endpoint.
     * @returns {string} url
     */
    getFQDNSignIn(): string {
        if (this.state == null) {
            this.state = this.generateRandomString(CognitoConstants.STATELENGTH,
                CognitoConstants.STATEORIGINSTRING);
        }

        const identityProviderParam = this.identityProvider
            ? CognitoConstants.AMPERSAND.concat(
                CognitoConstants.DOMAIN_QUERY_PARAM_IDENTITY_PROVIDER,
                CognitoConstants.EQUALSIGN, this.identityProvider)
            : '';
        const tokenScopesString = this.getSpaceSeperatedScopeString();

        var userContextDataParam = '';
        var userContextData = this.getUserContextData();
        if (userContextData) {
            userContextDataParam = CognitoConstants.AMPERSAND + CognitoConstants.DOMAIN_QUERY_PARAM_USERCONTEXTDATA +
                CognitoConstants.EQUALSIGN + this.getUserContextData();
        }

        // Build the complete web domain to launch the login screen
        const uri = CognitoConstants.DOMAIN_SCHEME.concat(
            CognitoConstants.COLONDOUBLESLASH, this.getAppWebDomain(),
            CognitoConstants.SLASH, CognitoConstants.DOMAIN_PATH_SIGNIN,
            CognitoConstants.QUESTIONMARK,
            CognitoConstants.DOMAIN_QUERY_PARAM_REDIRECT_URI,
            CognitoConstants.EQUALSIGN, encodeURIComponent(this.redirectUriSignIn),
            CognitoConstants.AMPERSAND,
            CognitoConstants.DOMAIN_QUERY_PARAM_RESPONSE_TYPE,
            CognitoConstants.EQUALSIGN,
            this.responseType, CognitoConstants.AMPERSAND, CognitoConstants.CLIENT_ID,
            CognitoConstants.EQUALSIGN, this.getClientId(),
            CognitoConstants.AMPERSAND, CognitoConstants.STATE,
            CognitoConstants.EQUALSIGN, this.state, CognitoConstants.AMPERSAND,
            CognitoConstants.SCOPE, CognitoConstants.EQUALSIGN, tokenScopesString, identityProviderParam,
            userContextDataParam);

        return uri;
    }

    /**
     * Sign out the user.
     * @returns {void}
     */
    signOut(): void {
        const URL = this.getFQDNSignOut();
        this.signInUserSession = null;
        this.clearCachedTokensScopes();
        this.launchUri(URL);
    }

    /**
     * Create the FQDN(fully qualified domain name) for signout endpoint.
     * @returns {string} url
     */
    getFQDNSignOut(): string {
        const uri = CognitoConstants.DOMAIN_SCHEME.concat(
            CognitoConstants.COLONDOUBLESLASH, this.getAppWebDomain(),
            CognitoConstants.SLASH, CognitoConstants.DOMAIN_PATH_SIGNOUT,
            CognitoConstants.QUESTIONMARK,
            CognitoConstants.DOMAIN_QUERY_PARAM_SIGNOUT_URI,
            CognitoConstants.EQUALSIGN, encodeURIComponent(this.redirectUriSignOut),
            CognitoConstants.AMPERSAND,
            CognitoConstants.CLIENT_ID,
            CognitoConstants.EQUALSIGN, this.getClientId());
        return uri;
    }

    /**
     * This method returns the encoded data string used for cognito advanced security feature.
     * This would be generated only when developer has included the JS used for collecting the
     * data on their client. Please refer to documentation to know more about using AdvancedSecurity
     * features
     **/
    getUserContextData() {

        if (typeof AmazonCognitoAdvancedSecurityData === "undefined") {
            return;
        }

        var _username = "";
        if (this.username) {
            _username = this.username;
        }

        var _userpoolId = "";
        if (this.userPoolId) {
            _userpoolId = this.userPoolId;
        }

        if (this.advancedSecurityDataCollectionFlag) {
            return AmazonCognitoAdvancedSecurityData.getData(_username, _userpoolId, this.clientId);
        }
    }

    /**
     * Helper method to let the user know if he has either a valid cached session 
     * or a valid authenticated session from the app integration callback.
     * @returns {boolean} userSignedIn 
     */
    isUserSignedIn(): boolean {
        return (this.signInUserSession != null && this.signInUserSession.isValid()) ||
            (this.getCachedSession() != null && this.getCachedSession().isValid());
    }
}