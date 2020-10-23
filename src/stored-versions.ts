const storedVersions = new Map();

export function clearStore() {
	storedVersions.clear();
}

export function getStoredVersion(path: string, etag: string): any | undefined {
	const stored = storedVersions.get([path, etag].join("////"));
	if (!stored) {
		return undefined;
	}
	return JSON.parse(stored);
}

export function setStoredVersion(path: string, etag: string, json: any) {
	storedVersions.set([path, etag].join("////"), JSON.stringify(json));
}
