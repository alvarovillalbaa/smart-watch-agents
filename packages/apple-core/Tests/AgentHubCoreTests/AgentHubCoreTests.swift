import Testing
@testable import AgentHubCore

@Test func publicKeyIsPEM() throws { #expect(try DeviceIdentity().publicKeyPEM.contains("BEGIN PUBLIC KEY")) }
